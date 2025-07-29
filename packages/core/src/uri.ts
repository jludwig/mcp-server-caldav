import type { CalDavResourceTemplate } from './templates';
import {
  getAllTemplates,
  getTemplate,
  validateTemplateVariables,
} from './templates';

export interface ParsedCalDavUri {
  templateName: string;
  variables: Record<string, string>;
  template: CalDavResourceTemplate;
}

export function parseCalDavUri(uri: string): ParsedCalDavUri {
  if (!uri.startsWith('caldav://')) {
    throw new Error('URI must start with caldav://');
  }

  // Remove protocol prefix
  const withoutProtocol = uri.slice('caldav://'.length);

  // Find the template that matches this URI pattern
  const templates = getAllTemplates();

  // Sort templates to prioritize more specific patterns first
  const sortedTemplates = [...templates].sort((a, b) => {
    // Prioritize templates with literal strings first
    const aHasLiteral =
      a.uriTemplate.includes('VTODO') || a.uriTemplate.includes('_meta');
    const bHasLiteral =
      b.uriTemplate.includes('VTODO') || b.uriTemplate.includes('_meta');

    if (aHasLiteral && !bHasLiteral) return -1;
    if (!aHasLiteral && bHasLiteral) return 1;

    // Then prioritize templates with query parameters
    const aHasQuery = a.uriTemplate.includes('?');
    const bHasQuery = b.uriTemplate.includes('?');

    if (aHasQuery && !bHasQuery) return -1;
    if (!aHasQuery && bHasQuery) return 1;

    // Among query templates, prioritize those with more specific patterns
    if (aHasQuery && bHasQuery) {
      const aParamCount = (a.uriTemplate.match(/[?&]/g) || []).length;
      const bParamCount = (b.uriTemplate.match(/[?&]/g) || []).length;
      return bParamCount - aParamCount;
    }

    return 0;
  });

  for (const template of sortedTemplates) {
    const variables = tryParseWithTemplate(withoutProtocol, template);
    if (variables) {
      // Validate the extracted variables
      const validation = validateTemplateVariables(template.name, variables);
      if (!validation.isValid) {
        throw new Error(
          `Invalid URI variables: ${validation.errors.join(', ')}`,
        );
      }

      return {
        templateName: template.name,
        variables,
        template,
      };
    }
  }

  throw new Error(`No matching template found for URI: ${uri}`);
}

function tryParseWithTemplate(
  uri: string,
  template: CalDavResourceTemplate,
): Record<string, string> | null {
  // Handle query parameters specially
  const [pathPart, queryPart] = uri.split('?');
  const [templatePath, templateQuery] = template.uriTemplate
    .replace('caldav://', '')
    .split('?');

  const variables: Record<string, string> = {};

  // Special handling for specific templates
  if (
    template.name === 'components-by-cat' &&
    templatePath === '{principal}/{calendarId}/VTODO'
  ) {
    // Check if path ends with VTODO
    if (!pathPart.endsWith('/VTODO')) {
      return null;
    }
    // Extract principal and calendarId
    const parts = pathPart.slice(0, -6).split('/'); // Remove '/VTODO'
    if (parts.length < 2) return null;
    const calendarId = parts.pop();
    const principal = parts.join('/');
    variables.principal = decodeURIComponent(principal);
    if (calendarId) {
      variables.calendarId = decodeURIComponent(calendarId);
    }
  } else if (
    template.name === 'metadata-list-cals' &&
    templatePath === '{principal}/_meta/calendars'
  ) {
    // Check if path ends with /_meta/calendars
    if (!pathPart.endsWith('/_meta/calendars')) {
      return null;
    }
    // Extract principal
    const principal = pathPart.slice(0, -16); // Remove '/_meta/calendars'
    variables.principal = decodeURIComponent(principal);
  } else {
    // Generic handling for variable-only templates
    const pathPattern = templatePath.replace(/{([^}]+)}/g, (match, varName) => {
      // Allow slashes in principal, but not in calendarId, comp, or uid
      if (varName === 'principal') {
        return `(?<${varName}>.+?)`;
      }
      return `(?<${varName}>[^/?]+)`;
    });

    const pathRegex = new RegExp(`^${pathPattern}$`);
    const pathMatch = pathPart.match(pathRegex);

    if (!pathMatch) {
      return null;
    }

    // Extract path variables with URL decoding
    if (pathMatch.groups) {
      for (const [key, value] of Object.entries(pathMatch.groups)) {
        variables[key] = decodeURIComponent(value);
      }
    }
  }

  // Parse query parameters if present
  if (templateQuery && queryPart) {
    const queryParams = new URLSearchParams(queryPart);

    // Extract query variable names from template
    const queryVarMatches = templateQuery.matchAll(/{([^}]+)}/g);
    for (const match of queryVarMatches) {
      const varName = match[1];
      const value = queryParams.get(varName);
      if (value !== null) {
        variables[varName] = value;
      }
    }
  } else if (templateQuery && !queryPart) {
    // Template expects query params but URI doesn't have them
    return null;
  } else if (!templateQuery && queryPart) {
    // URI has query params but template doesn't expect them
    return null;
  }

  return variables;
}

export function buildCalDavUri(
  templateName: string,
  variables: Record<string, string>,
): string {
  const template = getTemplate(templateName);
  if (!template) {
    throw new Error(`Unknown template: ${templateName}`);
  }

  // Validate variables
  const validation = validateTemplateVariables(templateName, variables);
  if (!validation.isValid) {
    throw new Error(`Invalid variables: ${validation.errors.join(', ')}`);
  }

  // Replace variables in template
  let uri = template.uriTemplate;
  for (const [key, value] of Object.entries(variables)) {
    uri = uri.replace(new RegExp(`{${key}}`, 'g'), encodeURIComponent(value));
  }

  // Check for unreplaced variables
  const unreplacedVars = uri.match(/{([^}]+)}/g);
  if (unreplacedVars) {
    throw new Error(`Missing variables: ${unreplacedVars.join(', ')}`);
  }

  return uri;
}

export function extractCalendarPath(variables: Record<string, string>): string {
  const { principal, calendarId } = variables;
  if (!principal || !calendarId) {
    throw new Error('Missing required variables: principal and calendarId');
  }

  // Ensure principal ends with /
  const normalizedPrincipal = principal.endsWith('/')
    ? principal
    : `${principal}/`;
  return `${normalizedPrincipal}${calendarId}/`;
}

export function isMetadataRequest(templateName: string): boolean {
  return templateName.startsWith('metadata-');
}

export function getComponentType(
  variables: Record<string, string>,
): string | undefined {
  return variables.comp;
}

export function getTimeRange(variables: Record<string, string>): {
  start?: string;
  end?: string;
} {
  return {
    start: variables.start,
    end: variables.end,
  };
}

export function getFilterParams(
  variables: Record<string, string>,
): Record<string, string> {
  const filterParams: Record<string, string> = {};

  if (variables.cat) filterParams.category = variables.cat;
  if (variables.jmes) filterParams.jmesFilter = variables.jmes;
  if (variables.uid) filterParams.uid = variables.uid;

  return filterParams;
}
