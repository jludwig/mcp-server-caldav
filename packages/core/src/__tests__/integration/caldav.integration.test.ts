import assert from 'node:assert';
import { exec } from 'node:child_process';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { type CalDavClient, createCalDavClient } from '../../caldav';
import { CalDavRequestHandler } from '../../handler';

const execAsync = promisify(exec);

// Skip integration tests by default unless explicitly enabled
const skipIntegrationTests = process.env.RUN_INTEGRATION_TESTS !== 'true';

describe('CalDAV Integration Tests', { skip: skipIntegrationTests }, () => {
  let davicalUrl: string;
  let client: CalDavClient;
  let handler: CalDavRequestHandler;

  before(async () => {
    // Start DAViCal container if not already running
    davicalUrl = 'http://localhost:8080';

    try {
      // Check if DAViCal is already running
      const response = await fetch(`${davicalUrl}/`);
      if (!response.ok) {
        throw new Error('DAViCal not available');
      }
    } catch (error) {
      console.log('Starting DAViCal container...');
      try {
        await execAsync('docker-compose -f docker-compose.test.yml up -d');

        // Wait for DAViCal to be ready
        let retries = 30;
        while (retries > 0) {
          try {
            const response = await fetch(`${davicalUrl}/`);
            if (response.ok) break;
          } catch (e) {
            // Service not ready yet
          }
          await new Promise((resolve) => setTimeout(resolve, 2000));
          retries--;
        }

        if (retries === 0) {
          throw new Error('DAViCal failed to start within timeout');
        }
      } catch (startError) {
        console.warn('Could not start DAViCal container:', startError);
        throw new Error('DAViCal not available for integration tests');
      }
    }

    // Create test user and calendar
    await setupTestData();

    // Initialize CalDAV client
    client = await createCalDavClient({
      serverUrl: davicalUrl,
      credentials: {
        username: 'testuser',
        password: 'testpass',
      },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    });

    handler = new CalDavRequestHandler();
  });

  after(async () => {
    // Clean up - stop DAViCal container
    try {
      await execAsync('docker-compose -f docker-compose.test.yml down');
    } catch (error) {
      console.warn('Error stopping DAViCal container:', error);
    }
  });

  async function setupTestData() {
    // This would typically involve setting up test users and calendars
    // For now, we'll assume DAViCal has default setup
    console.log('Setting up test data...');

    try {
      // Read sample events from test data
      const fs = await import('node:fs/promises');
      // Resolve __dirname in ESM context
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const sampleEventsPath = path.resolve(
        __dirname,
        '../../../../test-data/sample-events.ics',
      );
      const sampleEvents = await fs.readFile(sampleEventsPath, 'utf-8');

      // Parse individual events from the sample calendar
      const eventBlocks = sampleEvents
        .split('BEGIN:VEVENT')
        .slice(1) // Remove the first empty part
        .map((block) => `BEGIN:VEVENT${block.split('END:VEVENT')[0]}END:VEVENT`)
        .filter((block) => block.includes('UID:'));

      console.log(`Found ${eventBlocks.length} sample events to upload`);

      // Upload each event individually using CalDAV PUT requests
      const calendarUrl = `${davicalUrl}/caldav.php/testuser/calendar/`;

      for (let i = 0; i < eventBlocks.length; i++) {
        const eventBlock = eventBlocks[i];

        // Extract UID from the event block for filename
        const uidMatch = eventBlock.match(/UID:([^\r\n]+)/);
        const uid = uidMatch ? uidMatch[1].trim() : `event${i + 1}`;

        const eventWrapper = `${[
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'PRODID:-//Test Data//Test Data//EN',
          eventBlock,
          'END:VCALENDAR',
        ].join('\r\n')}\r\n`; // Add trailing CRLF

        try {
          // Use UID as filename for CalDAV best practice
          const eventUrl = `${calendarUrl}${uid}.ics`;
          const response = await fetch(eventUrl, {
            method: 'PUT',
            headers: {
              Authorization: `Basic ${Buffer.from('testuser:testpass').toString('base64')}`,
              'Content-Type': 'text/calendar',
            },
            body: eventWrapper,
          });

          // Accept any 2xx success status
          if (response.ok) {
            console.log(
              `Successfully uploaded event ${uid} (${response.status})`,
            );
          } else {
            console.warn(`Failed to upload event ${uid}: ${response.status}`);
          }
        } catch (uploadError) {
          console.warn(`Error uploading event ${uid}:`, uploadError);
        }
      }

      console.log('Test data setup completed');
    } catch (error) {
      console.warn('Could not load sample test data:', error);
      // Continue without sample data - tests should still work with empty calendar
    }
  }

  describe('Discovery', () => {
    it('should discover user principal and calendar collections', async () => {
      const uri = 'caldav://testuser/_meta/calendars';

      const response = await handler.handleRequest({
        uri,
        client,
      });

      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.mimeType, 'application/json');

      const metadata = JSON.parse(response.content);
      assert.ok(metadata.principal);
      assert.ok(metadata.home);
      assert.ok(Array.isArray(metadata.calendars));
    });
  });

  describe('Template URI Handling', () => {
    it('should handle components-range requests', async () => {
      const uri =
        'caldav://testuser/calendar/VEVENT?start=2024-01-01&end=2024-01-31';

      const response = await handler.handleRequest({
        uri,
        client,
      });

      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.mimeType, 'text/calendar');
      assert.ok(response.content.includes('BEGIN:VCALENDAR'));
      assert.ok(response.content.includes('END:VCALENDAR'));
    });

    it('should handle components-by-cat requests', async () => {
      const uri = 'caldav://testuser/calendar/VTODO?cat=Work';

      const response = await handler.handleRequest({
        uri,
        client,
      });

      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.mimeType, 'text/calendar');
      assert.ok(response.content.includes('BEGIN:VCALENDAR'));
    });

    it('should handle component-by-uid requests', async () => {
      const uri = 'caldav://testuser/calendar/nonexistent-uid';

      const response = await handler.handleRequest({
        uri,
        client,
      });

      // Should return empty calendar for non-existent UID
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.mimeType, 'text/calendar');
      assert.ok(response.content.includes('BEGIN:VCALENDAR'));
      assert.ok(response.content.includes('END:VCALENDAR'));
    });

    it('should handle invalid calendar ID with error', async () => {
      const uri =
        'caldav://testuser/nonexistent-calendar/VEVENT?start=2024-01-01&end=2024-01-31';

      const response = await handler.handleRequest({
        uri,
        client,
      });

      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.mimeType, 'application/json');

      const error = JSON.parse(response.content);
      assert.ok(error.error.includes('Calendar not found'));
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid URI format', async () => {
      const uri = 'invalid://uri/format';

      const response = await handler.handleRequest({
        uri,
        client,
      });

      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.mimeType, 'application/json');

      const error = JSON.parse(response.content);
      assert.ok(error.error.includes('URI must start with caldav://'));
    });

    it('should handle invalid component type', async () => {
      const uri =
        'caldav://testuser/calendar/INVALID?start=2024-01-01&end=2024-01-31';

      const response = await handler.handleRequest({
        uri,
        client,
      });

      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.mimeType, 'application/json');

      const error = JSON.parse(response.content);
      assert.ok(error.error.includes('Invalid value for comp'));
    });

    it('should handle request timeout', async () => {
      const uri =
        'caldav://testuser/calendar/VEVENT?start=2024-01-01&end=2024-01-31';

      const response = await handler.handleRequest({
        uri,
        client,
        timeout: 50, // 50ms timeout to force timeout
      });

      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.mimeType, 'application/json');

      const error = JSON.parse(response.content);
      assert.ok(
        error.error.includes('timeout') || error.error.includes('Timeout'),
      );
    });
  });

  describe('Performance', () => {
    it('should cache discovery results', async () => {
      const uri1 = 'caldav://testuser/_meta/calendars';
      const uri2 = 'caldav://testuser/_meta/calendars';

      const start1 = Date.now();
      await handler.handleRequest({ uri: uri1, client });
      const time1 = Date.now() - start1;

      const start2 = Date.now();
      await handler.handleRequest({ uri: uri2, client });
      const time2 = Date.now() - start2;

      // Second request should be faster due to caching
      assert.ok(
        time2 < time1 || time2 < 100,
        'Second request should be faster or very quick',
      );

      // Verify cache is working
      assert.ok(handler.getDiscoveryCacheSize() > 0);
    });

    it('should handle concurrent requests', async () => {
      const uri = 'caldav://testuser/_meta/calendars';

      const promises = Array(5)
        .fill(null)
        .map(() => handler.handleRequest({ uri, client }));

      const responses = await Promise.all(promises);

      // All requests should succeed
      for (const response of responses) {
        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.mimeType, 'application/json');
      }
    });
  });
});
