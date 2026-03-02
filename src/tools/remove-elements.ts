import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readDiagram, writeDiagram } from "../xml/parser.js";

const RemoveElementsSchema = {
  filePath: z.string().describe("Path to the .drawio file"),
  pageIndex: z.number().default(0).describe("Page index (0-based)"),
  ids: z.array(z.string()).describe("Array of element IDs to remove"),
};

export function registerRemoveElementsTool(server: McpServer): void {
  server.tool(
    "remove_elements",
    "Remove elements from a diagram page by ID, with cascade deletion of connected edges",
    RemoveElementsSchema,
    async ({ filePath, pageIndex, ids }) => {
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
      const removalSet = new Set(ids);

      // Cascade: find edges that reference any removed vertex as source or target
      for (const el of page.elements) {
        if (el.type === "edge" && !removalSet.has(el.id)) {
          if (
            (el.source && removalSet.has(el.source)) ||
            (el.target && removalSet.has(el.target))
          ) {
            removalSet.add(el.id);
          }
        }
      }

      // Track which IDs actually existed and were removed
      const existingIds = new Set(page.elements.map((el) => el.id));
      const removed: string[] = [];
      const notFound: string[] = [];

      for (const id of removalSet) {
        if (existingIds.has(id)) {
          removed.push(id);
        } else {
          notFound.push(id);
        }
      }

      // Filter out all elements in the removal set
      page.elements = page.elements.filter((el) => !removalSet.has(el.id));

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
            text: JSON.stringify({ removed, notFound }),
          },
        ],
      };
    },
  );
}
