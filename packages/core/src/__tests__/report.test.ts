import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  buildCalendarQuery,
  buildMultiget,
  buildPropFind,
  parseMultiStatusResponse,
} from '../report';

describe('Report functions', () => {
  describe('buildCalendarQuery', () => {
    it('should build basic calendar query', () => {
      const xml = buildCalendarQuery({});

      assert.ok(xml.includes('<?xml version="1.0" encoding="utf-8"?>'));
      assert.ok(
        xml.includes(
          '<C:calendar-query xmlns:C="urn:ietf:params:xml:ns:caldav"',
        ),
      );
      assert.ok(xml.includes('<D:getetag/>'));
      assert.ok(xml.includes('<C:calendar-data/>'));
      assert.ok(xml.includes('</C:calendar-query>'));
    });

    it('should build query with component filter', () => {
      const xml = buildCalendarQuery({
        componentType: 'VEVENT',
      });

      assert.ok(xml.includes('<C:comp-filter name="VCALENDAR">'));
      assert.ok(xml.includes('<C:comp-filter name="VEVENT">'));
    });

    it('should build query with time range filter', () => {
      const xml = buildCalendarQuery({
        componentType: 'VEVENT',
        timeRange: {
          start: '2024-01-01',
          end: '2024-01-31',
        },
      });

      assert.ok(
        xml.includes(
          '<C:time-range start="2024-01-01T00:00:00Z" end="2024-01-31T00:00:00Z"/>',
        ),
      );
    });

    it('should build query with category filter', () => {
      const xml = buildCalendarQuery({
        componentType: 'VTODO',
        categoryFilter: 'work',
      });

      assert.ok(xml.includes('<C:prop-filter name="CATEGORIES">'));
      assert.ok(
        xml.includes(
          '<C:text-match collation="i;ascii-casemap">work</C:text-match>',
        ),
      );
    });

    it('should build query with UID filter', () => {
      const xml = buildCalendarQuery({
        componentType: 'VEVENT',
        uid: 'event123@example.com',
      });

      assert.ok(xml.includes('<C:prop-filter name="UID">'));
      assert.ok(
        xml.includes(
          '<C:text-match collation="i;ascii-casemap">event123@example.com</C:text-match>',
        ),
      );
    });

    it('should build query with JMES filter comment', () => {
      const xml = buildCalendarQuery({
        componentType: 'VEVENT',
        jmesFilter: 'summary == "Meeting"',
      });

      assert.ok(
        xml.includes('<!-- JMES filter: summary == &quot;Meeting&quot; -->'),
      );
    });

    it('should escape XML characters in filters', () => {
      const xml = buildCalendarQuery({
        componentType: 'VEVENT',
        categoryFilter: 'work&personal<test>',
      });

      assert.ok(xml.includes('work&amp;personal&lt;test&gt;'));
    });
  });

  describe('buildPropFind', () => {
    it('should build basic PROPFIND', () => {
      const xml = buildPropFind(['displayname', 'resourcetype']);

      assert.ok(xml.includes('<?xml version="1.0" encoding="utf-8"?>'));
      assert.ok(xml.includes('<D:propfind xmlns:D="DAV:"'));
      assert.ok(xml.includes('<D:displayname/>'));
      assert.ok(xml.includes('<D:resourcetype/>'));
      assert.ok(xml.includes('</D:propfind>'));
    });

    it('should handle CalDAV namespaced properties', () => {
      const xml = buildPropFind(['displayname', 'caldav:calendar-home-set']);

      assert.ok(xml.includes('<D:displayname/>'));
      assert.ok(xml.includes('<C:calendar-home-set/>'));
    });
  });

  describe('buildMultiget', () => {
    it('should build calendar multiget request', () => {
      const hrefs = ['/calendar/event1.ics', '/calendar/event2.ics'];
      const xml = buildMultiget(hrefs);

      assert.ok(xml.includes('<C:calendar-multiget'));
      assert.ok(xml.includes('<D:href>/calendar/event1.ics</D:href>'));
      assert.ok(xml.includes('<D:href>/calendar/event2.ics</D:href>'));
      assert.ok(xml.includes('</C:calendar-multiget>'));
    });

    it('should escape href values', () => {
      const hrefs = ['/calendar/event<test>.ics'];
      const xml = buildMultiget(hrefs);

      assert.ok(xml.includes('/calendar/event&lt;test&gt;.ics'));
    });
  });

  describe('parseMultiStatusResponse', () => {
    it('should parse simple multistatus response', () => {
      const xmlResponse = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>/calendar/event1.ics</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>"abc123"</D:getetag>
        <C:calendar-data>BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:event1@example.com
SUMMARY:Test Event
END:VEVENT
END:VCALENDAR</C:calendar-data>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;

      const results = parseMultiStatusResponse(xmlResponse);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].href, '/calendar/event1.ics');
      assert.ok(results[0].calendarData?.includes('BEGIN:VCALENDAR'));
      assert.ok(results[0].calendarData?.includes('UID:event1@example.com'));
    });

    it('should handle parsing errors gracefully', () => {
      const invalidXml = 'not valid xml';

      const result = parseMultiStatusResponse(invalidXml);
      assert.strictEqual(result.length, 0);
    });
  });
});
