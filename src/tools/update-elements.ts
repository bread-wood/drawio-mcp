import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readDiagram, writeDiagram } from "../xml/parser.js";

const UpdateElementsSchema = {
  filePath: z.string().describe("Path to the .drawio file"),
  pageIndex: z.number().default(0).describe("Page index (0-based)"),
  updates: z
    .array(
      z.object({
        id: z.string().describe("ID of the element to update"),
        label: z.string().optional().describe("New display label"),
        style: z
          .record(z.string())
          .optional()
          .describe("Style properties to merge into existing style"),
        x: z.number().optional().describe("New X position"),
        y: z.number().optional().describe("New Y position"),
        width: z.number().optional().describe("New width"),
        height: z.number().optional().describe("New height"),
      }),
    )
    .describe("Array of element updates"),
};

export function registerUpdateElementsTool(server: McpServer): void {
  server.tool(
    "update_elements",
    "Update properties of existing elements in a diagram page",
    UpdateElementsSchema,
    async ({ filePath, pageIndex, updates }) => {
      let diagram;
      try {
        diagram = await readDiagram(filePath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error reading diagram: ${message}` }],
          isError: true,
        };
      }

      if (pageIndex < 0 || pageIndex >= diagram.pages.length) {
        return {
          content: [
            {
              type: "text",
              text: `Error: page index ${pageIndex} out of range (0..${diagram.pages.length - 1})`,
            },
          ],
          isError: true,
        };
      }

      const page = diagram.pages[pageIndex];

      for (const update of updates) {
        const element = page.elements.find((el) => el.id === update.id);
        if (!element) {
          return {
            content: [
              { type: "text", text: `Error: element with id "${update.id}" not found` },
            ],
            isError: true,
          };
        }

        if (update.label !== undefined) {
          element.label = update.label;
        }

        if (update.style !== undefined) {
          element.style = { ...element.style, ...update.style };
        }

        const hasGeometry =
          update.x !== undefined ||
          update.y !== undefined ||
          update.width !== undefined ||
          update.height !== undefined;

        if (hasGeometry) {
          if (!element.geometry) {
            element.geometry = { x: 0, y: 0, width: 120, height: 60 };
          }
          if (update.x !== undefined) element.geometry.x = update.x;
          if (update.y !== undefined) element.geometry.y = update.y;
          if (update.width !== undefined) element.geometry.width = update.width;
          if (update.height !== undefined) element.geometry.height = update.height;
        }
      }

      try {
        await writeDiagram(filePath, diagram);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error writing diagram: ${message}` }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ updated: updates.length }),
          },
        ],
      };
    },
  );
}
