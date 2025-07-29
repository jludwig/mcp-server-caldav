import type { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';

export interface TemplateVariable {
  name: string;
  description: string;
  required: boolean;
  type: 'string' | 'date' | 'datetime';
  pattern?: string;
  enum?: string[];
}

export interface CalDavResourceTemplate extends ResourceTemplate {
  variables: TemplateVariable[];
  description: string;
}

export const CALDAV_TEMPLATES: CalDavResourceTemplate[] = [
  {
    name: 'components-range',
    description: 'Calendar components within a specific time range',
    uriTemplate:
      'caldav://{principal}/{calendarId}/{comp}?start={start}&end={end}',
    mimeType: 'text/calendar',
    variables: [
      {
        name: 'principal',
        description: 'CalDAV principal path',
        required: true,
        type: 'string',
      },
      {
        name: 'calendarId',
        description: 'Calendar collection identifier',
        required: true,
        type: 'string',
      },
      {
        name: 'comp',
        description: 'Component type',
        required: true,
        type: 'string',
        enum: ['VEVENT', 'VTODO', 'VJOURNAL'],
      },
      {
        name: 'start',
        description: 'Start date/time in ISO format',
        required: true,
        type: 'datetime',
        pattern: '^\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2}:\\d{2}Z?)?$',
      },
      {
        name: 'end',
        description: 'End date/time in ISO format',
        required: true,
        type: 'datetime',
        pattern: '^\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2}:\\d{2}Z?)?$',
      },
    ],
  },
  {
    name: 'components-by-cat',
    description: 'Tasks filtered by CATEGORIES property',
    uriTemplate: 'caldav://{principal}/{calendarId}/VTODO?cat={cat}',
    mimeType: 'text/calendar',
    variables: [
      {
        name: 'principal',
        description: 'CalDAV principal path',
        required: true,
        type: 'string',
      },
      {
        name: 'calendarId',
        description: 'Calendar collection identifier',
        required: true,
        type: 'string',
      },
      {
        name: 'cat',
        description: 'Category name to filter by',
        required: true,
        type: 'string',
      },
    ],
  },
  {
    name: 'component-by-uid',
    description: 'Single calendar component by UID',
    uriTemplate: 'caldav://{principal}/{calendarId}/{uid}',
    mimeType: 'text/calendar',
    variables: [
      {
        name: 'principal',
        description: 'CalDAV principal path',
        required: true,
        type: 'string',
      },
      {
        name: 'calendarId',
        description: 'Calendar collection identifier',
        required: true,
        type: 'string',
      },
      {
        name: 'uid',
        description: 'Unique identifier of the component',
        required: true,
        type: 'string',
      },
    ],
  },
  {
    name: 'components-query',
    description: 'Advanced component filtering with JMES-like expressions',
    uriTemplate: 'caldav://{principal}/{calendarId}/{comp}?filter={jmes}',
    mimeType: 'text/calendar',
    variables: [
      {
        name: 'principal',
        description: 'CalDAV principal path',
        required: true,
        type: 'string',
      },
      {
        name: 'calendarId',
        description: 'Calendar collection identifier',
        required: true,
        type: 'string',
      },
      {
        name: 'comp',
        description: 'Component type',
        required: true,
        type: 'string',
        enum: ['VEVENT', 'VTODO', 'VJOURNAL'],
      },
      {
        name: 'jmes',
        description: 'JMES-like filter expression',
        required: true,
        type: 'string',
      },
    ],
  },
  {
    name: 'metadata-list-cals',
    description: 'JSON metadata listing all available calendars',
    uriTemplate: 'caldav://{principal}/_meta/calendars',
    mimeType: 'application/json',
    variables: [
      {
        name: 'principal',
        description: 'CalDAV principal path',
        required: true,
        type: 'string',
      },
    ],
  },
];

export function validateTemplateVariables(
  templateName: string,
  variables: Record<string, string>,
): { isValid: boolean; errors: string[] } {
  const template = CALDAV_TEMPLATES.find((t) => t.name === templateName);
  if (!template) {
    return { isValid: false, errors: [`Unknown template: ${templateName}`] };
  }

  const errors: string[] = [];

  // Check required variables
  for (const templateVar of template.variables) {
    if (templateVar.required && !variables[templateVar.name]) {
      errors.push(`Missing required variable: ${templateVar.name}`);
      continue;
    }

    const value = variables[templateVar.name];
    if (!value) continue;

    // Type validation
    if (templateVar.type === 'datetime' || templateVar.type === 'date') {
      if (templateVar.pattern && !new RegExp(templateVar.pattern).test(value)) {
        errors.push(
          `Invalid ${templateVar.type} format for ${templateVar.name}: ${value}`,
        );
      }
    }

    // Enum validation
    if (templateVar.enum && !templateVar.enum.includes(value)) {
      errors.push(
        `Invalid value for ${templateVar.name}: ${value}. Must be one of: ${templateVar.enum.join(', ')}`,
      );
    }
  }

  return { isValid: errors.length === 0, errors };
}

export function getTemplate(name: string): CalDavResourceTemplate | undefined {
  return CALDAV_TEMPLATES.find((t) => t.name === name);
}

export function getAllTemplates(): CalDavResourceTemplate[] {
  return CALDAV_TEMPLATES;
}
