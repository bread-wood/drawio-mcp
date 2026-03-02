import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerExportDiagramTool } from "./tools/export-diagram.js";

const SERVER_NAME = "drawio-mcp";
const SERVER_VERSION = "0.1.0";

export function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerExportDiagramTool(server);

  return server;
}
