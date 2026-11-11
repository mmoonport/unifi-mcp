#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ConfigError, loadConfig } from './config.js';
import { createServer } from './tools.js';
import { Udm } from './udm.js';

try {
  const config = loadConfig(process.env);
  const server = createServer(new Udm(config.udm), { ...config.server, audit: (line) => process.stderr.write(`unifi-mcp: ${line}\n`) });
  await server.connect(new StdioServerTransport());
  process.stderr.write(`unifi-mcp: ready, writes ${config.server.allowWrite ? 'ON' : 'off'}\n`);
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  process.stderr.write(`unifi-mcp: ${error.message}\n`);
  process.exit(1);
}
