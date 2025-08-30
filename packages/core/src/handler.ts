import type { CalDavClient } from './caldav';
import { CalDavDiscovery, type DiscoveryResult } from './discovery';
import { CalDavFilters, type CalendarComponent } from './filters';
import { type CalendarQueryOptions, buildCalendarQuery } from './report';
import {
  type ParsedCalDavUri,
  getComponentType,
  getFilterParams,
  getTimeRange,
  isMetadataRequest,
  parseCalDavUri,
} from './uri';

export interface CalDavRequestContext {
  uri: string;
  client: CalDavClient;
  timeout?: number;
}

export interface CalDavResponse {
  content: string;
  mimeType: string;
  status: number;
}

export class CalDavRequestHandler {
  private discoveryCache = new Map<
    string,
    { result: DiscoveryResult; timestamp: number }
  >();
  private readonly CACHE_TTL = 300000; // 5 minutes

  constructor(private defaultTimeout = 30000) {}

  async handleRequest(context: CalDavRequestContext): Promise<CalDavResponse> {
    try {
      const parsed = parseCalDavUri(context.uri);
      const discovery = await this.getDiscoveryResult(context.client);

      if (isMetadataRequest(parsed.templateName)) {
        return await this.handleMetadataRequest(parsed, discovery);
      }
      return await this.handleCalendarRequest(
        parsed,
        discovery,
        context.client,
        context.timeout,
      );
    } catch (error) {
      return {
        content: JSON.stringify({
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        }),
        mimeType: 'application/json',
        status: 400,
      };
    }
  }

  private async getDiscoveryResult(
    client: CalDavClient,
  ): Promise<DiscoveryResult> {
    // Key cache on both server URL and username to prevent session leakage
    const cacheKey = `${client.serverUrl}:${client.credentials.username || 'anonymous'}`;
    const cached = this.discoveryCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.result;
    }

    const discovery = new CalDavDiscovery(client);
    const result = await discovery.discover();

    this.discoveryCache.set(cacheKey, {
      result,
      timestamp: Date.now(),
    });

    return result;
  }

  private async handleMetadataRequest(
    parsed: ParsedCalDavUri,
    discovery: DiscoveryResult,
  ): Promise<CalDavResponse> {
    if (parsed.templateName === 'metadata-list-cals') {
      const metadata = {
        principal: discovery.principal,
        home: discovery.home,
        calendars: discovery.collections.map((col) => ({
          id: col.calendarId,
          displayName: col.displayName,
          componentSet: col.componentSet,
          href: col.href,
        })),
        timestamp: new Date().toISOString(),
      };

      return {
        content: JSON.stringify(metadata, null, 2),
        mimeType: 'application/json',
        status: 200,
      };
    }

    throw new Error(`Unknown metadata template: ${parsed.templateName}`);
  }

  private async handleCalendarRequest(
    parsed: ParsedCalDavUri,
    discovery: DiscoveryResult,
    client: CalDavClient,
    timeout?: number,
  ): Promise<CalDavResponse> {
    const { variables } = parsed;

    // Validate calendar exists
    const calendar = discovery.collections.find(
      (col) => col.calendarId === variables.calendarId,
    );
    if (!calendar) {
      throw new Error(`Calendar not found: ${variables.calendarId}`);
    }

    // Build query options
    const queryOptions: CalendarQueryOptions = {
      componentType: getComponentType(variables),
      timeRange: getTimeRange(variables),
    };

    const filterParams = getFilterParams(variables);
    if (filterParams.category)
      queryOptions.categoryFilter = filterParams.category;
    if (filterParams.uid) queryOptions.uid = filterParams.uid;
    if (filterParams.jmesFilter)
      queryOptions.jmesFilter = filterParams.jmesFilter;

    // Execute CalDAV query
    const calendarData = await this.executeCalendarQuery(
      client,
      calendar.href,
      queryOptions,
      timeout || this.defaultTimeout,
    );

    // Apply additional client-side filtering if needed
    let components = CalDavFilters.parseICalendarData(calendarData);

    if (filterParams.category) {
      components = CalDavFilters.filterByCategory(
        components,
        filterParams.category,
      );
    }
    if (filterParams.uid) {
      components = CalDavFilters.filterByUid(components, filterParams.uid);
    }
    if (filterParams.jmesFilter) {
      components = CalDavFilters.filterByJmesExpression(
        components,
        filterParams.jmesFilter,
      );
    }

    // Convert back to iCalendar format
    const filteredCalendar = CalDavFilters.componentsToICalendar(components);

    return {
      content: filteredCalendar,
      mimeType: 'text/calendar',
      status: 200,
    };
  }

  private async executeCalendarQuery(
    client: CalDavClient,
    calendarUrl: string,
    options: CalendarQueryOptions,
    timeout: number,
  ): Promise<string> {
    try {
      // Create a timeout promise that rejects after the specified timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), timeout);
      });

      // Execute the REPORT request
      const reportPromise = client.calendarQuery({
        url: calendarUrl,
        props: [
          {
            name: 'getetag',
            namespace: 'DAV:',
          },
          {
            name: 'calendar-data',
            namespace: 'urn:ietf:params:xml:ns:caldav',
          },
        ],
        filters: this.buildFiltersFromOptions(options),
      });

      const result = await Promise.race([reportPromise, timeoutPromise]);

      // Extract calendar data from results
      const calendarData = result
        .map((item: any) => item.props?.['calendar-data'])
        .filter(Boolean)
        .join('\n');

      return calendarData || this.createEmptyCalendar();
    } catch (error) {
      if (error instanceof Error && error.message === 'Request timeout') {
        throw new Error('CalDAV server request timed out');
      }
      throw new Error(
        `CalDAV query failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private buildFiltersFromOptions(options: CalendarQueryOptions): any {
    const filters: any = { type: 'comp-filter', name: 'VCALENDAR' };

    if (options.componentType) {
      const comp: any = { name: options.componentType, isNotDefined: false };
      if (options.timeRange?.start || options.timeRange?.end) {
        comp.timeRange = {
          start: options.timeRange.start,
          end: options.timeRange.end,
        };
      }
      filters.compFilters = [comp];
    } else if (options.timeRange?.start || options.timeRange?.end) {
      // Some servers require a component filter even for time-range-only queries
      filters.timeRange = {
        start: options.timeRange.start,
        end: options.timeRange.end,
      };
    }

    return filters;
  }

  private createEmptyCalendar(): string {
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//MCP CalDAV Server//EN',
      'END:VCALENDAR',
    ].join('\r\n');
  }

  clearDiscoveryCache(): void {
    this.discoveryCache.clear();
  }

  getDiscoveryCacheSize(): number {
    return this.discoveryCache.size;
  }
}
