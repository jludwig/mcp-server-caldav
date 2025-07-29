import assert from 'node:assert';
import { describe, it } from 'node:test';
import { CalDavFilters } from '../filters';

describe('CalDavFilters', () => {
  const sampleICalData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:event1@example.com
DTSTART:20240115T100000Z
DTEND:20240115T110000Z
SUMMARY:Team Meeting
CATEGORIES:Work,Important
STATUS:CONFIRMED
DESCRIPTION:Weekly team meeting
LOCATION:Conference Room A
END:VEVENT
BEGIN:VTODO
UID:todo1@example.com
DTSTART:20240116T090000Z
SUMMARY:Complete Project
CATEGORIES:Work
STATUS:IN-PROCESS
PRIORITY:1
END:VTODO
BEGIN:VEVENT
UID:event2@example.com
DTSTART:20240120T140000Z
DTEND:20240120T150000Z
SUMMARY:Personal Appointment
CATEGORIES:Personal
STATUS:TENTATIVE
END:VEVENT
END:VCALENDAR`;

  describe('parseICalendarData', () => {
    it('should parse iCalendar data correctly', () => {
      const components = CalDavFilters.parseICalendarData(sampleICalData);

      assert.strictEqual(components.length, 3);

      const event1 = components.find((c) => c.uid === 'event1@example.com');
      assert.ok(event1);
      assert.strictEqual(event1.summary, 'Team Meeting');
      assert.deepStrictEqual(event1.categories, ['Work', 'Important']);
      assert.strictEqual(event1.status, 'CONFIRMED');
      assert.strictEqual(event1.description, 'Weekly team meeting');
      assert.strictEqual(event1.location, 'Conference Room A');

      const todo1 = components.find((c) => c.uid === 'todo1@example.com');
      assert.ok(todo1);
      assert.strictEqual(todo1.summary, 'Complete Project');
      assert.strictEqual(todo1.priority, 1);
      assert.strictEqual(todo1.status, 'IN-PROCESS');
    });

    it('should handle empty calendar', () => {
      const emptyCalendar = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
END:VCALENDAR`;

      const components = CalDavFilters.parseICalendarData(emptyCalendar);
      assert.strictEqual(components.length, 0);
    });
  });

  describe('filterByCategory', () => {
    it('should filter components by category', () => {
      const components = CalDavFilters.parseICalendarData(sampleICalData);
      const workComponents = CalDavFilters.filterByCategory(components, 'Work');

      assert.strictEqual(workComponents.length, 2);
      assert.ok(workComponents.every((c) => c.categories?.includes('Work')));
    });

    it('should perform case-insensitive category matching', () => {
      const components = CalDavFilters.parseICalendarData(sampleICalData);
      const workComponents = CalDavFilters.filterByCategory(components, 'work');

      assert.strictEqual(workComponents.length, 2);
    });
  });

  describe('filterByTimeRange', () => {
    it('should filter components by time range', () => {
      const components = CalDavFilters.parseICalendarData(sampleICalData);

      // Filter for events in January 15-16, 2024
      const filtered = CalDavFilters.filterByTimeRange(
        components,
        '2024-01-15T00:00:00Z',
        '2024-01-16T23:59:59Z',
      );

      assert.strictEqual(filtered.length, 2); // event1 and todo1
      assert.ok(filtered.some((c) => c.uid === 'event1@example.com'));
      assert.ok(filtered.some((c) => c.uid === 'todo1@example.com'));
    });

    it('should return all components when no time range specified', () => {
      const components = CalDavFilters.parseICalendarData(sampleICalData);
      const filtered = CalDavFilters.filterByTimeRange(components);

      assert.strictEqual(filtered.length, components.length);
    });
  });

  describe('filterByStatus', () => {
    it('should filter components by status', () => {
      const components = CalDavFilters.parseICalendarData(sampleICalData);
      const confirmedComponents = CalDavFilters.filterByStatus(
        components,
        'CONFIRMED',
      );

      assert.strictEqual(confirmedComponents.length, 1);
      assert.strictEqual(confirmedComponents[0].uid, 'event1@example.com');
    });
  });

  describe('filterByUid', () => {
    it('should filter component by UID', () => {
      const components = CalDavFilters.parseICalendarData(sampleICalData);
      const filtered = CalDavFilters.filterByUid(
        components,
        'event1@example.com',
      );

      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].uid, 'event1@example.com');
    });
  });

  describe('filterByJmesExpression', () => {
    it('should filter by simple property equality', () => {
      const components = CalDavFilters.parseICalendarData(sampleICalData);
      const filtered = CalDavFilters.filterByJmesExpression(
        components,
        'status == "CONFIRMED"',
      );

      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].status, 'CONFIRMED');
    });

    it('should filter by contains expression', () => {
      const components = CalDavFilters.parseICalendarData(sampleICalData);
      const filtered = CalDavFilters.filterByJmesExpression(
        components,
        'contains(summary, "Meeting")',
      );

      assert.strictEqual(filtered.length, 1);
      assert.ok(filtered[0].summary?.includes('Meeting'));
    });

    it('should filter by array length', () => {
      const components = CalDavFilters.parseICalendarData(sampleICalData);
      const filtered = CalDavFilters.filterByJmesExpression(
        components,
        'length(categories) > 1',
      );

      assert.strictEqual(filtered.length, 1);
      assert.ok(filtered[0].categories && filtered[0].categories.length > 1);
    });

    it('should return all components for unknown expressions', () => {
      const components = CalDavFilters.parseICalendarData(sampleICalData);
      const filtered = CalDavFilters.filterByJmesExpression(
        components,
        'unknown.expression',
      );

      assert.strictEqual(filtered.length, components.length);
    });
  });

  describe('combineFilters', () => {
    it('should apply multiple filters', () => {
      const components = CalDavFilters.parseICalendarData(sampleICalData);
      const filtered = CalDavFilters.combineFilters(components, {
        category: 'Work',
        status: 'CONFIRMED',
      });

      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].uid, 'event1@example.com');
    });
  });

  describe('componentsToICalendar', () => {
    it('should convert components back to iCalendar format', () => {
      const components = CalDavFilters.parseICalendarData(sampleICalData);
      const singleComponent = components.filter(
        (c) => c.uid === 'event1@example.com',
      );
      const icalOutput = CalDavFilters.componentsToICalendar(singleComponent);

      assert.ok(icalOutput.includes('BEGIN:VCALENDAR'));
      assert.ok(icalOutput.includes('END:VCALENDAR'));
      assert.ok(icalOutput.includes('BEGIN:VEVENT'));
      assert.ok(icalOutput.includes('END:VEVENT'));
      assert.ok(icalOutput.includes('UID:event1@example.com'));
      assert.ok(icalOutput.includes('SUMMARY:Team Meeting'));
    });

    it('should create empty calendar for no components', () => {
      const icalOutput = CalDavFilters.componentsToICalendar([]);

      assert.ok(icalOutput.includes('BEGIN:VCALENDAR'));
      assert.ok(icalOutput.includes('END:VCALENDAR'));
      assert.ok(!icalOutput.includes('BEGIN:VEVENT'));
    });
  });
});
