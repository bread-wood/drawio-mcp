import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAddConnectionsTool } from "./tools/add-connections.js";
import { registerAddElementsTool } from "./tools/add-elements.js";
import { registerCreateDiagramTool } from "./tools/create-diagram.js";
import { registerExportDiagramTool } from "./tools/export-diagram.js";
import { registerGetDiagramTool } from "./tools/get-diagram.js";
import { registerListStylesTool } from "./tools/list-styles.js";

const SERVER_NAME = "drawio-mcp";
const SERVER_VERSION = "0.1.0";

export function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerAddConnectionsTool(server);
  registerAddElementsTool(server);
  registerCreateDiagramTool(server);
  registerExportDiagramTool(server);
  registerGetDiagramTool(server);
  registerListStylesTool(server);

  return server;
}
