import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readDiagram, writeDiagram } from "../xml/parser.js";
import type { DiagramElement } from "../model/diagram.js";
import { PRESETS } from "../model/styles.js";

const AddElementsSchema = {
  filePath: z.string().describe("Path to the .drawio file"),
  pageIndex: z.number().default(0).describe("Page index (0-based)"),
  elements: z
    .array(
      z.object({
        id: z.string().optional().describe("Element ID (auto-generated if omitted)"),
        label: z.string().default("").describe("Display label"),
        preset: z.string().optional().describe("Style preset name from PRESETS"),
        style: z.record(z.string()).optional().describe("Custom style overrides"),
        x: z.number().default(0).describe("X position"),
        y: z.number().default(0).describe("Y position"),
        width: z.number().default(120).describe("Width"),
        height: z.number().default(60).describe("Height"),
      }),
    )
    .describe("Array of elements to add"),
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

export function registerAddElementsTool(server: McpServer): void {
  server.tool(
    "add_elements",
    "Add one or more shape/vertex elements to a diagram page",
    AddElementsSchema,
    async ({ filePath, pageIndex, elements }) => {
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
      let nextId = findMaxNumericId(page.elements) + 1;
      const createdIds: string[] = [];

      for (const el of elements) {
        const id = el.id ?? String(nextId++);

        // Build style: start from preset if given, then merge overrides
        let style: Record<string, string> = {};
        if (el.preset) {
          const presetStyle = PRESETS[el.preset];
          if (!presetStyle) {
            return {
              content: [
                { type: "text", text: `Error: unknown preset "${el.preset}"` },
              ],
              isError: true,
            };
          }
          style = { ...presetStyle };
        }
        if (el.style) {
          style = { ...style, ...el.style };
        }

        const element: DiagramElement = {
          id,
          type: "vertex",
          label: el.label,
          style,
          parent: "1",
          geometry: {
            x: el.x,
            y: el.y,
            width: el.width,
            height: el.height,
          },
        };

        page.elements.push(element);
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
