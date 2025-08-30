import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { type CalDavClientOptions, createCalDavClient } from './caldav';
import { CalDavRequestHandler } from './handler';
import { CALDAV_TEMPLATES } from './templates';

export const createCalDavMcpServer = async (
  calDavClientOptions: CalDavClientOptions,
) => {
  const calDavClient = await createCalDavClient(calDavClientOptions);
  const requestHandler = new CalDavRequestHandler();

  const server = new McpServer({
    name: 'caldav',
    version: '0.1.0',
  });

  // Register resource templates
  server.setRequestHandler('resources/templates/list', async () => {
    return {
      resourceTemplates: CALDAV_TEMPLATES,
    };
  });

  // Handle resource read requests
  server.setRequestHandler('resources/read', async (request) => {
    if (!request.params.uri) {
      throw new Error('URI parameter is required');
    }

    const response = await requestHandler.handleRequest({
      uri: request.params.uri,
      client: calDavClient,
    });

    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: response.mimeType,
          text: response.content,
        },
      ],
    };
  });

  return server;
};

// Export types and classes for external use
export type { CalDavClientOptions } from './caldav';
export { CalDavRequestHandler } from './handler';
export { CALDAV_TEMPLATES } from './templates';
export {
  parseCalDavUri,
  buildCalDavUri,
  extractCalendarPath,
  isMetadataRequest,
} from './uri';

// Compatibility shim for previous CalDavUriParser class-based API
export const CalDavUriParser = {
  parse: parseCalDavUri,
  build: buildCalDavUri,
  extractCalendarPath,
  isMetadataRequest,
} as const;
