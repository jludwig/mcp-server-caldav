import {
  McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js';

import { createCalDavClient, type CalDavClientOptions } from './caldav';

export const createCalDavMcpServer = async (
  calDavClientOptions: CalDavClientOptions,
) => {
  const calDavClient = await createCalDavClient(calDavClientOptions);

  const server = new McpServer({
    name: 'caldav',
    version: '0.1.0',
  });

  return server;
};
