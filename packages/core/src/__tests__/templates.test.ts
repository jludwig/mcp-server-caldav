import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  CALDAV_TEMPLATES,
  getAllTemplates,
  getTemplate,
  validateTemplateVariables,
} from '../templates';

describe('Template functions', () => {
  describe('validateVariables', () => {
    it('should validate components-range template variables', () => {
      const variables = {
        principal: 'users/john',
        calendarId: 'calendar1',
        comp: 'VEVENT',
        start: '2024-01-01',
        end: '2024-01-31',
      };

      const result = validateTemplateVariables('components-range', variables);
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    it('should fail validation for missing required variables', () => {
      const variables = {
        principal: 'users/john',
        // missing calendarId, comp, start, end
      };

      const result = validateTemplateVariables('components-range', variables);
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.length > 0);
      assert.ok(result.errors.some((e) => e.includes('calendarId')));
    });

    it('should fail validation for invalid component type', () => {
      const variables = {
        principal: 'users/john',
        calendarId: 'calendar1',
        comp: 'INVALID',
        start: '2024-01-01',
        end: '2024-01-31',
      };

      const result = validateTemplateVariables('components-range', variables);
      assert.strictEqual(result.isValid, false);
      assert.ok(
        result.errors.some((e) => e.includes('Invalid value for comp')),
      );
    });

    it('should fail validation for invalid date format', () => {
      const variables = {
        principal: 'users/john',
        calendarId: 'calendar1',
        comp: 'VEVENT',
        start: 'invalid-date',
        end: '2024-01-31',
      };

      const result = validateTemplateVariables('components-range', variables);
      assert.strictEqual(result.isValid, false);
      assert.ok(
        result.errors.some((e) => e.includes('Invalid datetime format')),
      );
    });

    it('should validate datetime with time component', () => {
      const variables = {
        principal: 'users/john',
        calendarId: 'calendar1',
        comp: 'VEVENT',
        start: '2024-01-01T09:00:00Z',
        end: '2024-01-31T17:00:00Z',
      };

      const result = validateTemplateVariables('components-range', variables);
      assert.strictEqual(result.isValid, true);
    });

    it('should fail for unknown template', () => {
      const result = validateTemplateVariables('unknown-template', {});
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some((e) => e.includes('Unknown template')));
    });
  });

  describe('getTemplate', () => {
    it('should return template by name', () => {
      const template = getTemplate('components-range');
      assert.ok(template);
      assert.strictEqual(template.name, 'components-range');
    });

    it('should return undefined for unknown template', () => {
      const template = getTemplate('unknown');
      assert.strictEqual(template, undefined);
    });
  });

  describe('getAllTemplates', () => {
    it('should return all templates', () => {
      const templates = getAllTemplates();
      assert.strictEqual(templates.length, 5);
      assert.ok(templates.find((t) => t.name === 'components-range'));
      assert.ok(templates.find((t) => t.name === 'components-by-cat'));
      assert.ok(templates.find((t) => t.name === 'component-by-uid'));
      assert.ok(templates.find((t) => t.name === 'components-query'));
      assert.ok(templates.find((t) => t.name === 'metadata-list-cals'));
    });
  });
});

describe('CALDAV_TEMPLATES', () => {
  it('should have correct template structure', () => {
    for (const template of CALDAV_TEMPLATES) {
      assert.ok(template.name);
      assert.ok(template.description);
      assert.ok(template.uriTemplate);
      assert.ok(template.mimeType);
      assert.ok(Array.isArray(template.variables));

      for (const variable of template.variables) {
        assert.ok(variable.name);
        assert.ok(variable.description);
        assert.ok(typeof variable.required === 'boolean');
        assert.ok(['string', 'date', 'datetime'].includes(variable.type));
      }
    }
  });

  it('should have unique template names', () => {
    const names = CALDAV_TEMPLATES.map((t) => t.name);
    const uniqueNames = new Set(names);
    assert.strictEqual(names.length, uniqueNames.size);
  });
});
