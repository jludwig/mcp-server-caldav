import assert from 'node:assert';
import { before, describe, it } from 'node:test';
import {
  buildCalDavUri,
  extractCalendarPath,
  getComponentType,
  getTimeRange,
  isMetadataRequest,
  parseCalDavUri,
} from '../uri';

describe('CalDavUriParser', () => {
  describe('parse', () => {
    it('should parse components-range URI', () => {
      const uri =
        'caldav://users/john/calendar1/VEVENT?start=2024-01-01&end=2024-01-31';
      const result = parseCalDavUri(uri);

      assert.strictEqual(result.templateName, 'components-range');
      assert.strictEqual(result.variables.principal, 'users/john');
      assert.strictEqual(result.variables.calendarId, 'calendar1');
      assert.strictEqual(result.variables.comp, 'VEVENT');
      assert.strictEqual(result.variables.start, '2024-01-01');
      assert.strictEqual(result.variables.end, '2024-01-31');
    });

    it('should parse components-by-cat URI', () => {
      const uri = 'caldav://users/john/tasks/VTODO?cat=work';
      const result = parseCalDavUri(uri);

      assert.strictEqual(result.templateName, 'components-by-cat');
      assert.strictEqual(result.variables.principal, 'users/john');
      assert.strictEqual(result.variables.calendarId, 'tasks');
      assert.strictEqual(result.variables.cat, 'work');
    });

    it('should parse component-by-uid URI', () => {
      const uri = 'caldav://users/john/calendar1/event123';
      const result = parseCalDavUri(uri);

      assert.strictEqual(result.templateName, 'component-by-uid');
      assert.strictEqual(result.variables.principal, 'users/john');
      assert.strictEqual(result.variables.calendarId, 'calendar1');
      assert.strictEqual(result.variables.uid, 'event123');
    });

    it('should parse metadata-list-cals URI', () => {
      const uri = 'caldav://users/john/_meta/calendars';
      const result = parseCalDavUri(uri);

      assert.strictEqual(result.templateName, 'metadata-list-cals');
      assert.strictEqual(result.variables.principal, 'users/john');
    });

    it('should throw error for invalid URI protocol', () => {
      const uri = 'http://example.com/calendar';
      assert.throws(
        () => parseCalDavUri(uri),
        /URI must start with caldav:\/\//,
      );
    });

    it('should throw error for no matching template', () => {
      const uri = 'caldav://invalid/structure';
      assert.throws(() => parseCalDavUri(uri), /No matching template found/);
    });
  });

  describe('buildUri', () => {
    it('should build components-range URI', () => {
      const variables = {
        principal: 'users/john',
        calendarId: 'calendar1',
        comp: 'VEVENT',
        start: '2024-01-01',
        end: '2024-01-31',
      };

      const uri = buildCalDavUri('components-range', variables);
      assert.strictEqual(
        uri,
        'caldav://users%2Fjohn/calendar1/VEVENT?start=2024-01-01&end=2024-01-31',
      );
    });

    it('should throw error for unknown template', () => {
      assert.throws(() => buildCalDavUri('unknown', {}), /Unknown template/);
    });

    it('should throw error for missing variables', () => {
      assert.throws(
        () => buildCalDavUri('components-range', {}),
        /Invalid variables/,
      );
    });
  });

  describe('helper methods', () => {
    it('should extract calendar path', () => {
      const variables = { principal: 'users/john', calendarId: 'calendar1' };
      const path = extractCalendarPath(variables);
      assert.strictEqual(path, 'users/john/calendar1/');
    });

    it('should identify metadata requests', () => {
      assert.strictEqual(isMetadataRequest('metadata-list-cals'), true);
      assert.strictEqual(isMetadataRequest('components-range'), false);
    });

    it('should get component type', () => {
      const variables = { comp: 'VEVENT' };
      assert.strictEqual(getComponentType(variables), 'VEVENT');
    });

    it('should get time range', () => {
      const variables = { start: '2024-01-01', end: '2024-01-31' };
      const timeRange = getTimeRange(variables);
      assert.strictEqual(timeRange.start, '2024-01-01');
      assert.strictEqual(timeRange.end, '2024-01-31');
    });

    it('should handle URL encoding/decoding round-trip symmetry', () => {
      // Test with special characters that need encoding
      const originalVars = {
        principal: 'users/john@example.com',
        calendarId: 'my calendar',
        comp: 'VEVENT',
        start: '2024-01-01',
        end: '2024-01-31',
      };

      // Build URI (this encodes the variables)
      const uri = buildCalDavUri('components-range', originalVars);

      // Parse URI back (this should decode the variables)
      const parsed = parseCalDavUri(uri);

      // Variables should match original after round-trip
      assert.strictEqual(parsed.variables.principal, originalVars.principal);
      assert.strictEqual(parsed.variables.calendarId, originalVars.calendarId);
      assert.strictEqual(parsed.variables.comp, originalVars.comp);
      assert.strictEqual(parsed.variables.start, originalVars.start);
      assert.strictEqual(parsed.variables.end, originalVars.end);
    });
  });
});
