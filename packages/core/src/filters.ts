export interface CalendarComponent {
  uid: string;
  componentType?: string; // VEVENT, VTODO, VJOURNAL
  summary?: string;
  dtstart?: string;
  dtend?: string;
  categories?: string[];
  status?: string;
  priority?: number;
  description?: string;
  location?: string;
  [key: string]: any;
}

export class CalDavFilters {
  static parseICalendarData(icalData: string): CalendarComponent[] {
    const components: CalendarComponent[] = [];

    // First unfold all continuation lines (lines starting with space or tab)
    const unfoldedData = icalData.replace(/\r?\n[ \t]/g, '');
    const lines = unfoldedData.split(/\r?\n/);

    let currentComponent: Partial<CalendarComponent> | null = null;
    let inComponent = false;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      if (
        trimmedLine.startsWith('BEGIN:VEVENT') ||
        trimmedLine.startsWith('BEGIN:VTODO') ||
        trimmedLine.startsWith('BEGIN:VJOURNAL')
      ) {
        currentComponent = {};
        // Extract and store the component type
        const componentType = trimmedLine.split(':')[1];
        currentComponent.componentType = componentType;
        inComponent = true;
      } else if (
        trimmedLine.startsWith('END:VEVENT') ||
        trimmedLine.startsWith('END:VTODO') ||
        trimmedLine.startsWith('END:VJOURNAL')
      ) {
        if (currentComponent?.uid) {
          components.push(currentComponent as CalendarComponent);
        }
        currentComponent = null;
        inComponent = false;
      } else if (inComponent && currentComponent) {
        CalDavFilters.parseProperty(trimmedLine, currentComponent);
      }
    }

    return components;
  }

  private static parseProperty(
    line: string,
    component: Partial<CalendarComponent>,
  ): void {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) return;

    const propPart = line.substring(0, colonIndex);
    const value = line.substring(colonIndex + 1);

    // Parse property name and parameters
    const [propName, ...paramParts] = propPart.split(';');
    const params = CalDavFilters.parseParameters(paramParts);

    switch (propName.toUpperCase()) {
      case 'UID':
        component.uid = value;
        break;
      case 'SUMMARY':
        component.summary = CalDavFilters.unescapeValue(value);
        break;
      case 'DTSTART':
        component.dtstart = CalDavFilters.parseDateTime(value, params);
        break;
      case 'DTEND':
        component.dtend = CalDavFilters.parseDateTime(value, params);
        break;
      case 'CATEGORIES': {
        const parts = value.split(/(?<!\\),/);
        component.categories = parts.map((cat) =>
          CalDavFilters.unescapeValue(cat.trim()),
        );
        break;
      }
      case 'STATUS':
        component.status = value.toUpperCase();
        break;
      case 'PRIORITY':
        component.priority = Number.parseInt(value, 10);
        break;
      case 'DESCRIPTION':
        component.description = CalDavFilters.unescapeValue(value);
        break;
      case 'LOCATION':
        component.location = CalDavFilters.unescapeValue(value);
        break;
      default:
        // Store other properties as-is
        component[propName.toLowerCase()] = CalDavFilters.unescapeValue(value);
    }
  }

  private static parseParameters(paramParts: string[]): Record<string, string> {
    const params: Record<string, string> = {};
    for (const param of paramParts) {
      const [key, value] = param.split('=');
      if (key && value) {
        params[key.toUpperCase()] = value;
      }
    }
    return params;
  }

  private static parseDateTime(
    value: string,
    params: Record<string, string>,
  ): string {
    // Handle timezone conversion if needed
    if (params.TZID) {
      // For now, return as-is with timezone info
      return `${value} (${params.TZID})`;
    }
    return value;
  }

  private static unescapeValue(value: string): string {
    return value
      .replace(/\\n/g, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\');
  }

  static filterByCategory(
    components: CalendarComponent[],
    category: string,
  ): CalendarComponent[] {
    return components.filter((comp) =>
      comp.categories?.some((cat) =>
        cat.toLowerCase().includes(category.toLowerCase()),
      ),
    );
  }

  static filterByTimeRange(
    components: CalendarComponent[],
    start?: string,
    end?: string,
  ): CalendarComponent[] {
    if (!start && !end) return components;

    const startDate = start ? new Date(start) : null;
    const endDate = end ? new Date(end) : null;

    return components.filter((comp) => {
      if (!comp.dtstart) return false;

      // Parse iCalendar date format with proper YYYYMMDD and TZID handling
      const parseICalDate = (raw: string) => {
        const trimmed = raw.replace(/\s*\([^)]+\)\s*$/, ''); // strip " (TZID)" if present
        if (/^\d{8}T\d{6}Z?$/.test(trimmed)) {
          const z = trimmed.endsWith('Z') ? trimmed : `${trimmed}Z`;
          return new Date(
            z.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, '$1-$2-$3T$4:$5:$6Z'),
          );
        }
        if (/^\d{8}$/.test(trimmed)) {
          return new Date(
            trimmed.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3T00:00:00Z'),
          );
        }
        return new Date(trimmed);
      };

      const compStart = parseICalDate(comp.dtstart);
      const isAllDay = /^\d{8}$/.test((comp.dtstart || '').replace(/[^\d]/g, ''));
      const compEnd = comp.dtend
        ? parseICalDate(comp.dtend)
        : isAllDay
          ? new Date(compStart.getTime() + 24 * 60 * 60 * 1000)
          : compStart;

      if (startDate && compEnd < startDate) return false;
      if (endDate && compStart > endDate) return false;

      return true;
    });
  }

  static filterByStatus(
    components: CalendarComponent[],
    status: string,
  ): CalendarComponent[] {
    const normalizedStatus = status.toUpperCase();
    return components.filter((comp) => comp.status === normalizedStatus);
  }

  static filterByUid(
    components: CalendarComponent[],
    uid: string,
  ): CalendarComponent[] {
    return components.filter((comp) => comp.uid === uid);
  }

  static filterByJmesExpression(
    components: CalendarComponent[],
    jmesFilter: string,
  ): CalendarComponent[] {
    // Simple JMES-like filter implementation
    // In production, you might want to use a proper JMES library

    try {
      // Handle simple property access patterns like "summary" or "categories[0]"
      if (jmesFilter.includes('==')) {
        const [path, expectedValue] = jmesFilter
          .split('==')
          .map((s) => s.trim());
        const cleanExpected = expectedValue.replace(/['"]/g, '');

        return components.filter((comp) => {
          const actualValue = CalDavFilters.getNestedProperty(comp, path);
          return actualValue === cleanExpected;
        });
      }

      if (jmesFilter.includes('contains')) {
        const match = jmesFilter.match(
          /contains\(([^,]+),\s*['"]([^'"]+)['"]\)/,
        );
        if (match) {
          const [, path, searchValue] = match;
          return components.filter((comp) => {
            const actualValue = CalDavFilters.getNestedProperty(
              comp,
              path.trim(),
            );
            return (
              typeof actualValue === 'string' &&
              actualValue.includes(searchValue)
            );
          });
        }
      }

      // Handle array length checks
      if (jmesFilter.includes('length(')) {
        const match = jmesFilter.match(/length\(([^)]+)\)\s*([><=]+)\s*(\d+)/);
        if (match) {
          const [, path, operator, countStr] = match;
          const expectedCount = Number.parseInt(countStr, 10);

          return components.filter((comp) => {
            const arrayValue = CalDavFilters.getNestedProperty(
              comp,
              path.trim(),
            );
            if (!Array.isArray(arrayValue)) return false;

            switch (operator) {
              case '>':
                return arrayValue.length > expectedCount;
              case '<':
                return arrayValue.length < expectedCount;
              case '>=':
                return arrayValue.length >= expectedCount;
              case '<=':
                return arrayValue.length <= expectedCount;
              case '==':
                return arrayValue.length === expectedCount;
              default:
                return false;
            }
          });
        }
      }

      return components; // Return all if filter not understood
    } catch (error) {
      console.warn(
        `JMES filter parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return components;
    }
  }

  private static getNestedProperty(obj: any, path: string): any {
    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (key.includes('[') && key.includes(']')) {
        const [arrayKey, indexStr] = key.split('[');
        const index = Number.parseInt(indexStr.replace(']', ''), 10);
        current = current?.[arrayKey]?.[index];
      } else {
        current = current?.[key];
      }

      if (current === undefined) break;
    }

    return current;
  }

  static combineFilters(
    components: CalendarComponent[],
    filters: {
      category?: string;
      timeRange?: { start?: string; end?: string };
      status?: string;
      uid?: string;
      jmesFilter?: string;
    },
  ): CalendarComponent[] {
    let filtered = components;

    if (filters.category) {
      filtered = CalDavFilters.filterByCategory(filtered, filters.category);
    }

    if (filters.timeRange) {
      filtered = CalDavFilters.filterByTimeRange(
        filtered,
        filters.timeRange.start,
        filters.timeRange.end,
      );
    }

    if (filters.status) {
      filtered = CalDavFilters.filterByStatus(filtered, filters.status);
    }

    if (filters.uid) {
      filtered = CalDavFilters.filterByUid(filtered, filters.uid);
    }

    if (filters.jmesFilter) {
      filtered = CalDavFilters.filterByJmesExpression(
        filtered,
        filters.jmesFilter,
      );
    }

    return filtered;
  }

  static componentsToICalendar(components: CalendarComponent[]): string {
    const icalLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//MCP CalDAV Server//EN',
    ];

    for (const comp of components) {
      // Use stored component type, or fall back to heuristic
      const compType =
        comp.componentType ||
        (comp.dtstart ? 'VEVENT' : comp.status ? 'VTODO' : 'VJOURNAL');

      icalLines.push(`BEGIN:${compType}`);

      if (comp.uid) icalLines.push(`UID:${comp.uid}`);
      if (comp.summary)
        icalLines.push(`SUMMARY:${CalDavFilters.escapeValue(comp.summary)}`);
      if (comp.dtstart)
        icalLines.push(`DTSTART:${comp.dtstart.replace(/[^0-9TZ]/g, '')}`);
      if (comp.dtend)
        icalLines.push(`DTEND:${comp.dtend.replace(/[^0-9TZ]/g, '')}`);
      if (comp.description)
        icalLines.push(
          `DESCRIPTION:${CalDavFilters.escapeValue(comp.description)}`,
        );
      if (comp.location)
        icalLines.push(`LOCATION:${CalDavFilters.escapeValue(comp.location)}`);
      if (comp.status) icalLines.push(`STATUS:${comp.status}`);
      if (comp.priority) icalLines.push(`PRIORITY:${comp.priority}`);
      if (comp.categories?.length) {
        icalLines.push(
          `CATEGORIES:${comp.categories.map((c) => CalDavFilters.escapeValue(c)).join(',')}`,
        );
      }

      icalLines.push(`END:${compType}`);
    }

    icalLines.push('END:VCALENDAR');

    return icalLines.join('\r\n');
  }

  private static escapeValue(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r\n|\n|\r/g, '\\n');
  }
}
