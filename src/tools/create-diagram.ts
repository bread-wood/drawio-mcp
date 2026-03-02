import { z } from "zod";
import { access } from "node:fs/promises";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { writeDiagram } from "../xml/parser.js";
import type { Diagram, Page } from "../model/diagram.js";

const CreateDiagramSchema = {
  filePath: z.string().describe("Path for the new .drawio file"),
  pages: z
    .array(z.string())
    .optional()
    .describe("Page names (default: [\"Page-1\"])"),
};

export function registerCreateDiagramTool(server: McpServer): void {
  server.tool(
    "create_diagram",
    "Create a new .drawio diagram file with the specified pages",
    CreateDiagramSchema,
    async ({ filePath, pages: pageNames }) => {
      // Check if file already exists
      try {
        await access(filePath);
        return {
          content: [{ type: "text", text: `Error: file already exists: ${filePath}` }],
          isError: true,
        };
      } catch {
        // File does not exist — proceed
      }

      const names = pageNames ?? ["Page-1"];

      const diagramPages: Page[] = names.map((name, i) => ({
        id: `page-${i + 1}`,
        name,
        elements: [],
      }));

      const diagram: Diagram = { pages: diagramPages };

      try {
        await writeDiagram(filePath, diagram);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Created ${filePath} with ${names.length} page(s)`,
          },
        ],
      };
    },
  );
}
