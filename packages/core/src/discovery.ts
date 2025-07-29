import type { CalDavClient } from './caldav';

export interface CalendarCollection {
  calendarId: string;
  displayName: string;
  componentSet: string[];
  href: string;
}

export interface DiscoveryResult {
  principal: string;
  home: string;
  collections: CalendarCollection[];
}

export class CalDavDiscovery {
  constructor(private client: CalDavClient) {}

  async discover(): Promise<DiscoveryResult> {
    const principal = await this.getCurrentUserPrincipal();
    const home = await this.getCalendarHomeSet(principal);
    const collections = await this.getCalendarCollections(home);

    return {
      principal,
      home,
      collections,
    };
  }

  private async getCurrentUserPrincipal(): Promise<string> {
    const response = await this.client.propfind({
      url: this.client.serverUrl,
      props: [
        {
          name: 'current-user-principal',
          namespace: 'DAV:',
        },
      ],
      depth: '0',
    });

    const principal = response.find((r) => r.props?.['current-user-principal']);
    if (!principal?.props?.['current-user-principal']?.href) {
      throw new Error('Unable to determine current user principal');
    }

    return principal.props['current-user-principal'].href;
  }

  private async getCalendarHomeSet(principal: string): Promise<string> {
    const response = await this.client.propfind({
      url: principal,
      props: [
        {
          name: 'calendar-home-set',
          namespace: 'urn:ietf:params:xml:ns:caldav',
        },
      ],
      depth: '0',
    });

    const homeSet = response.find((r) => r.props?.['calendar-home-set']);
    if (!homeSet?.props?.['calendar-home-set']?.href) {
      throw new Error('Unable to determine calendar home set');
    }

    return homeSet.props['calendar-home-set'].href;
  }

  private async getCalendarCollections(
    home: string,
  ): Promise<CalendarCollection[]> {
    const response = await this.client.propfind({
      url: home,
      props: [
        {
          name: 'displayname',
          namespace: 'DAV:',
        },
        {
          name: 'resourcetype',
          namespace: 'DAV:',
        },
        {
          name: 'supported-calendar-component-set',
          namespace: 'urn:ietf:params:xml:ns:caldav',
        },
      ],
      depth: '1',
    });

    const collections: CalendarCollection[] = [];

    for (const item of response) {
      const resourceType = item.props?.resourcetype;
      const isCalendar = resourceType?.calendar !== undefined;

      if (isCalendar && item.href !== home) {
        const displayName = item.props?.displayname || 'Unnamed Calendar';
        const componentSet = this.parseComponentSet(
          item.props?.['supported-calendar-component-set'],
        );

        const calendarId = this.extractCalendarId(item.href, home);

        collections.push({
          calendarId,
          displayName,
          componentSet,
          href: item.href,
        });
      }
    }

    return collections;
  }

  private parseComponentSet(componentSetProp: any): string[] {
    if (!componentSetProp?.comp) {
      return ['VEVENT', 'VTODO', 'VJOURNAL']; // Default components
    }

    if (Array.isArray(componentSetProp.comp)) {
      return componentSetProp.comp.map((c: any) => c.name).filter(Boolean);
    }

    if (componentSetProp.comp.name) {
      return [componentSetProp.comp.name];
    }

    return ['VEVENT', 'VTODO', 'VJOURNAL'];
  }

  private extractCalendarId(href: string, home: string): string {
    const relativePath = href.replace(home, '').replace(/^\/+|\/+$/g, '');
    return relativePath || href.split('/').pop() || 'unknown';
  }
}
