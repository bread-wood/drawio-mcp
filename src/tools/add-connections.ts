import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readDiagram, writeDiagram } from "../xml/parser.js";
import type { DiagramElement } from "../model/diagram.js";

const AddConnectionsSchema = {
  filePath: z.string().describe("Path to the .drawio file"),
  pageIndex: z.number().default(0).describe("Page index (0-based)"),
  connections: z
    .array(
      z.object({
        id: z.string().optional().describe("Edge ID (auto-generated if omitted)"),
        label: z.string().default("").describe("Edge label"),
        source: z.string().describe("Source element ID"),
        target: z.string().describe("Target element ID"),
        style: z.record(z.string()).optional().describe("Custom style overrides"),
      }),
    )
    .describe("Array of connections to add"),
};

const DEFAULT_EDGE_STYLE: Record<string, string> = {
  edgeStyle: "orthogonalEdgeStyle",
  rounded: "1",
};

// Find the maximum numeric ID across all elements in a page, including root cells 0 and 1
function findMaxNumericId(elements: DiagramElement[]): number {
  let max = 1; // root cells 0 and 1 always exist
  for (const el of elements) {
    const num = Number(el.id);
    if (!Number.isNaN(num) && num > max) {
      max = num;
    }
  }
  return max;
}

export function registerAddConnectionsTool(server: McpServer): void {
  server.tool(
    "add_connections",
    "Add one or more edge/connection elements between existing elements",
    AddConnectionsSchema,
    async ({ filePath, pageIndex, connections }) => {
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
      const elementIds = new Set(page.elements.map((el) => el.id));
      let nextId = findMaxNumericId(page.elements) + 1;
      const createdIds: string[] = [];

      for (const conn of connections) {
        if (!elementIds.has(conn.source)) {
          return {
            content: [
              { type: "text", text: `Error: source element "${conn.source}" not found` },
            ],
            isError: true,
          };
        }
        if (!elementIds.has(conn.target)) {
          return {
            content: [
              { type: "text", text: `Error: target element "${conn.target}" not found` },
            ],
            isError: true,
          };
        }

        const id = conn.id ?? String(nextId++);
        const style = { ...DEFAULT_EDGE_STYLE, ...conn.style };

        const element: DiagramElement = {
          id,
          type: "edge",
          label: conn.label,
          style,
          parent: "1",
          source: conn.source,
          target: conn.target,
        };

        page.elements.push(element);
        elementIds.add(id);
        createdIds.push(id);
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
            text: JSON.stringify({ created: createdIds }),
          },
        ],
      };
    },
  );
}
