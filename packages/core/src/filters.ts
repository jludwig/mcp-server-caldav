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
  [key: string]: string | number | string[] | undefined;
}

export function parseICalendarData(icalData: string): CalendarComponent[] {
  const components: CalendarComponent[] = [];
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
      parseProperty(trimmedLine, currentComponent);
    }
  }

  return components;
}

function parseProperty(
  line: string,
  component: Partial<CalendarComponent>,
): void {
  const colonIndex = line.indexOf(':');
  if (colonIndex === -1) return;

  const propPart = line.substring(0, colonIndex);
  const value = line.substring(colonIndex + 1);

  const [propName, ...paramParts] = propPart.split(';');
  const params = parseParameters(paramParts);

  switch (propName.toUpperCase()) {
    case 'UID':
      component.uid = value;
      break;
    case 'SUMMARY':
      component.summary = unescapeValue(value);
      break;
    case 'DTSTART':
      component.dtstart = parseDateTime(value, params);
      break;
    case 'DTEND':
      component.dtend = parseDateTime(value, params);
      break;
    case 'CATEGORIES': {
      const parts = value.split(/(?<!\\),/);
      component.categories = parts.map((cat) => unescapeValue(cat.trim()));
      break;
    }
    case 'STATUS':
      component.status = value.toUpperCase();
      break;
    case 'PRIORITY':
      component.priority = Number.parseInt(value, 10);
      break;
    case 'DESCRIPTION':
      component.description = unescapeValue(value);
      break;
    case 'LOCATION':
      component.location = unescapeValue(value);
      break;
    default:
      component[propName.toLowerCase()] = unescapeValue(value);
  }
}

function parseParameters(paramParts: string[]): Record<string, string> {
  const params: Record<string, string> = {};
  for (const param of paramParts) {
    const [key, value] = param.split('=');
    if (key && value) {
      params[key.toUpperCase()] = value;
    }
  }
  return params;
}

function parseDateTime(value: string, params: Record<string, string>): string {
  if (params.TZID) {
    return `${value} (${params.TZID})`;
  }
  return value;
}

function unescapeValue(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

export function filterByCategory(
  components: CalendarComponent[],
  category: string,
): CalendarComponent[] {
  return components.filter((comp) =>
    comp.categories?.some((cat) =>
      cat.toLowerCase().includes(category.toLowerCase()),
    ),
  );
}

export function filterByTimeRange(
  components: CalendarComponent[],
  start?: string,
  end?: string,
): CalendarComponent[] {
  if (!start && !end) return components;

  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;

  return components.filter((comp) => {
    if (!comp.dtstart) return false;

    const parseICalDate = (raw: string) => {
      const trimmed = raw.replace(/\s*\([^)]+\)\s*$/, '');
      if (/^\d{8}T\d{6}Z?$/.test(trimmed)) {
        const z = trimmed.endsWith('Z') ? trimmed : `${trimmed}Z`;
        return new Date(
          z.replace(
            /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/,
            '$1-$2-$3T$4:$5:$6Z',
          ),
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

export function filterByStatus(
  components: CalendarComponent[],
  status: string,
): CalendarComponent[] {
  const normalizedStatus = status.toUpperCase();
  return components.filter((comp) => comp.status === normalizedStatus);
}

export function filterByUid(
  components: CalendarComponent[],
  uid: string,
): CalendarComponent[] {
  return components.filter((comp) => comp.uid === uid);
}

export function filterByJmesExpression(
  components: CalendarComponent[],
  jmesFilter: string,
): CalendarComponent[] {
  try {
    if (jmesFilter.includes('==')) {
      const [path, expectedValue] = jmesFilter.split('==').map((s) => s.trim());
      const cleanExpected = expectedValue.replace(/['"]/g, '');

      return components.filter((comp) => {
        const actualValue = getNestedProperty(
          comp as unknown as Record<string, unknown>,
          path,
        );
        return actualValue === cleanExpected;
      });
    }

    if (jmesFilter.includes('contains')) {
      const match = jmesFilter.match(/contains\(([^,]+),\s*['"]([^'"]+)['"]\)/);
      if (match) {
        const [, path, searchValue] = match;
        return components.filter((comp) => {
          const actualValue = getNestedProperty(
            comp as unknown as Record<string, unknown>,
            path.trim(),
          );
          return (
            typeof actualValue === 'string' && actualValue.includes(searchValue)
          );
        });
      }
    }

    if (jmesFilter.includes('length(')) {
      const match = jmesFilter.match(/length\(([^)]+)\)\s*([><=]+)\s*(\d+)/);
      if (match) {
        const [, path, operator, countStr] = match;
        const expectedCount = Number.parseInt(countStr, 10);

        return components.filter((comp) => {
          const arrayValue = getNestedProperty(
            comp as unknown as Record<string, unknown>,
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

    return components;
  } catch (error) {
    console.warn(
      `JMES filter parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
    return components;
  }
}

function getNestedProperty(
  obj: Record<string, unknown>,
  path: string,
): unknown {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (key.includes('[') && key.includes(']')) {
      const [arrayKey, indexStr] = key.split('[');
      const index = Number.parseInt(indexStr.replace(']', ''), 10);
      const container = current as Record<string, unknown> | undefined;
      const arr = (container?.[arrayKey] as unknown[] | undefined) ?? undefined;
      current = arr?.[index];
    } else {
      const container = current as Record<string, unknown> | undefined;
      current = container?.[key];
    }

    if (current === undefined) break;
  }

  return current;
}

export function combineFilters(
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
    filtered = filterByCategory(filtered, filters.category);
  }

  if (filters.timeRange) {
    filtered = filterByTimeRange(
      filtered,
      filters.timeRange.start,
      filters.timeRange.end,
    );
  }

  if (filters.status) {
    filtered = filterByStatus(filtered, filters.status);
  }

  if (filters.uid) {
    filtered = filterByUid(filtered, filters.uid);
  }

  if (filters.jmesFilter) {
    filtered = filterByJmesExpression(filtered, filters.jmesFilter);
  }

  return filtered;
}

export function componentsToICalendar(components: CalendarComponent[]): string {
  const icalLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MCP CalDAV Server//EN',
  ];

  for (const comp of components) {
    const compType =
      comp.componentType ||
      (comp.dtstart ? 'VEVENT' : comp.status ? 'VTODO' : 'VJOURNAL');

    icalLines.push(`BEGIN:${compType}`);

    if (comp.uid) icalLines.push(`UID:${comp.uid}`);
    if (comp.summary) icalLines.push(`SUMMARY:${escapeValue(comp.summary)}`);
    if (comp.dtstart)
      icalLines.push(`DTSTART:${comp.dtstart.replace(/[^0-9TZ]/g, '')}`);
    if (comp.dtend)
      icalLines.push(`DTEND:${comp.dtend.replace(/[^0-9TZ]/g, '')}`);
    if (comp.description)
      icalLines.push(`DESCRIPTION:${escapeValue(comp.description)}`);
    if (comp.location) icalLines.push(`LOCATION:${escapeValue(comp.location)}`);
    if (comp.status) icalLines.push(`STATUS:${comp.status}`);
    if (comp.priority) icalLines.push(`PRIORITY:${comp.priority}`);
    if (comp.categories?.length) {
      icalLines.push(
        `CATEGORIES:${comp.categories.map((c) => escapeValue(c)).join(',')}`,
      );
    }

    icalLines.push(`END:${compType}`);
  }

  icalLines.push('END:VCALENDAR');

  return icalLines.join('\r\n');
}

function escapeValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n');
}

// Backward-compatible object to match previous class static API
export const CalDavFilters = {
  parseICalendarData,
  filterByCategory,
  filterByTimeRange,
  filterByStatus,
  filterByUid,
  filterByJmesExpression,
  combineFilters,
  componentsToICalendar,
};
