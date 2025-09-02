export interface CalendarQueryOptions {
  componentType?: string;
  timeRange?: {
    start?: string;
    end?: string;
  };
  categoryFilter?: string;
  uid?: string;
  jmesFilter?: string;
}

function formatCalDavDateTime(dateTime: string): string {
  // Handle both date and datetime formats
  if (dateTime.includes('T')) {
    // Full datetime - ensure it ends with Z for UTC
    return dateTime.endsWith('Z') ? dateTime : `${dateTime}Z`;
  }
  return `${dateTime}T00:00:00Z`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildCalendarQuery(options: CalendarQueryOptions): string {
  const { componentType, timeRange, categoryFilter, uid, jmesFilter } = options;

  // Start building the REPORT XML
  const xmlParts = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<C:calendar-query xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:D="DAV:">',
    '  <D:prop>',
    '    <D:getetag/>',
    '    <C:calendar-data/>',
    '  </D:prop>',
  ];

  // Add filter section if needed
  if (componentType || timeRange || categoryFilter || uid || jmesFilter) {
    xmlParts.push('  <C:filter>');

    if (componentType) {
      xmlParts.push(`    <C:comp-filter name="VCALENDAR">`);
      xmlParts.push(`      <C:comp-filter name="${componentType}">`);

      // Add time range filter for the component
      if (timeRange?.start || timeRange?.end) {
        const startAttr = timeRange.start
          ? ` start="${formatCalDavDateTime(timeRange.start)}"`
          : '';
        const endAttr = timeRange.end
          ? ` end="${formatCalDavDateTime(timeRange.end)}"`
          : '';
        xmlParts.push(`        <C:time-range${startAttr}${endAttr}/>`);
      }

      // Add category filter
      if (categoryFilter) {
        xmlParts.push(`        <C:prop-filter name="CATEGORIES">`);
        xmlParts.push(
          `          <C:text-match collation="i;ascii-casemap">${escapeXml(categoryFilter)}</C:text-match>`,
        );
        xmlParts.push('        </C:prop-filter>');
      }

      // Add UID filter for single component lookup
      if (uid) {
        xmlParts.push(`        <C:prop-filter name="UID">`);
        xmlParts.push(
          `          <C:text-match collation="i;ascii-casemap">${escapeXml(uid)}</C:text-match>`,
        );
        xmlParts.push('        </C:prop-filter>');
      }

      // Note: JMES filter would need custom server-side processing
      // For now, we'll retrieve all components and filter client-side
      if (jmesFilter) {
        // This is a placeholder - actual JMES filtering would happen post-retrieval
        xmlParts.push(`        <!-- JMES filter: ${escapeXml(jmesFilter)} -->`);
      }

      xmlParts.push('      </C:comp-filter>');
      xmlParts.push('    </C:comp-filter>');
    } else {
      // Default filter for all calendar components
      xmlParts.push(`    <C:comp-filter name="VCALENDAR">`);

      if (timeRange?.start || timeRange?.end) {
        const startAttr = timeRange.start
          ? ` start="${formatCalDavDateTime(timeRange.start)}"`
          : '';
        const endAttr = timeRange.end
          ? ` end="${formatCalDavDateTime(timeRange.end)}"`
          : '';
        xmlParts.push(`      <C:time-range${startAttr}${endAttr}/>`);
      }

      xmlParts.push('    </C:comp-filter>');
    }

    xmlParts.push('  </C:filter>');
  }

  xmlParts.push('</C:calendar-query>');

  return xmlParts.join('\n');
}

export function buildPropFind(props: string[], depth = '0'): string {
  const xmlParts = [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">`,
    '  <D:prop>',
  ];

  for (const prop of props) {
    if (prop.includes(':')) {
      const [namespace, name] = prop.split(':');
      if (namespace === 'caldav' || namespace === 'C') {
        xmlParts.push(`    <C:${name}/>`);
      } else {
        xmlParts.push(`    <D:${name}/>`);
      }
    } else {
      xmlParts.push(`    <D:${prop}/>`);
    }
  }

  xmlParts.push('  </D:prop>');
  xmlParts.push('</D:propfind>');

  return xmlParts.join('\n');
}

export function buildMultiget(hrefs: string[]): string {
  const xmlParts = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<C:calendar-multiget xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:D="DAV:">',
    '  <D:prop>',
    '    <D:getetag/>',
    '    <C:calendar-data/>',
    '  </D:prop>',
  ];

  for (const href of hrefs) {
    xmlParts.push(`  <D:href>${escapeXml(href)}</D:href>`);
  }

  xmlParts.push('</C:calendar-multiget>');

  return xmlParts.join('\n');
}

export function parseMultiStatusResponse(xmlResponse: string): Array<{
  href: string;
  status: string;
  etag?: string;
  calendarData?: string;
  error?: string;
}> {
  // This is a simplified parser - in production, you'd use a proper XML parser
  const results: Array<{
    href: string;
    status: string;
    etag?: string;
    calendarData?: string;
    error?: string;
  }> = [];

  try {
    // Extract response elements (simplified regex parsing)
    const responseMatches = xmlResponse.matchAll(
      /<D:response[^>]*>(.*?)<\/D:response>/gs,
    );

    for (const responseMatch of responseMatches) {
      const responseContent = responseMatch[1];

      // Extract href
      const hrefMatch = responseContent.match(/<D:href[^>]*>(.*?)<\/D:href>/s);
      const href = hrefMatch ? hrefMatch[1].trim() : '';

      // Extract status
      const statusMatch = responseContent.match(
        /<D:status[^>]*>(.*?)<\/D:status>/s,
      );
      const status = statusMatch ? statusMatch[1].trim() : '';

      // Extract etag if present
      const etagMatch = responseContent.match(
        /<D:getetag[^>]*>(.*?)<\/D:getetag>/s,
      );
      const etag = etagMatch ? etagMatch[1].trim() : undefined;

      // Extract calendar data if present
      const calDataMatch = responseContent.match(
        /<C:calendar-data[^>]*>(.*?)<\/C:calendar-data>/s,
      );
      const calendarData = calDataMatch ? calDataMatch[1].trim() : undefined;

      results.push({
        href,
        status,
        etag,
        calendarData,
      });
    }
  } catch (error) {
    throw new Error(
      `Failed to parse CalDAV response: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }

  return results;
}
