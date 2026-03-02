import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readDiagram } from "../xml/parser.js";
import { buildStyle } from "../model/styles.js";

const GetDiagramSchema = {
  filePath: z.string().describe("Path to the .drawio file to read"),
  pageIndex: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Page index to return (0-based). If omitted, all pages are returned."),
};

export function registerGetDiagramTool(server: McpServer): void {
  server.tool(
    "get_diagram",
    "Read a .drawio file and return its structure as JSON",
    GetDiagramSchema,
    async ({ filePath, pageIndex }) => {
      try {
        const diagram = await readDiagram(filePath);

        if (pageIndex !== undefined) {
          if (pageIndex >= diagram.pages.length) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error: pageIndex ${pageIndex} out of range (file has ${diagram.pages.length} page${diagram.pages.length === 1 ? "" : "s"})`,
                },
              ],
              isError: true,
            };
          }

          const page = diagram.pages[pageIndex];
          const result = {
            totalPages: diagram.pages.length,
            page: formatPage(page),
          };
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        const result = {
          totalPages: diagram.pages.length,
          pages: diagram.pages.map(formatPage),
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );
}

function formatPage(page: { id: string; name: string; elements: Array<{
  id: string;
  type: "vertex" | "edge";
  label: string;
  style: Record<string, string>;
  parent: string;
  geometry?: { x: number; y: number; width: number; height: number };
  source?: string;
  target?: string;
}> }) {
  return {
    id: page.id,
    name: page.name,
    elementCount: page.elements.length,
    elements: page.elements.map((el) => {
      const base: Record<string, unknown> = {
        id: el.id,
        type: el.type,
        label: el.label,
        style: buildStyle(el.style),
      };
      if (el.geometry) {
        base.geometry = el.geometry;
      }
      if (el.type === "edge") {
        base.source = el.source;
        base.target = el.target;
      }
      return base;
    }),
  };
}
