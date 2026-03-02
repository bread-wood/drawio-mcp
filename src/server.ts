import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCreateDiagramTool } from "./tools/create-diagram.js";
import { registerExportDiagramTool } from "./tools/export-diagram.js";
import { registerListStylesTool } from "./tools/list-styles.js";

const SERVER_NAME = "drawio-mcp";
const SERVER_VERSION = "0.1.0";

export function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerCreateDiagramTool(server);
  registerExportDiagramTool(server);
  registerListStylesTool(server);

  return server;
}
