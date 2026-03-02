import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PRESETS, buildStyle } from "../model/styles.js";

const DESCRIPTIONS: Record<string, string> = {
  rectangle: "Rectangle shape",
  rounded_rectangle: "Rounded rectangle",
  ellipse: "Ellipse/oval shape",
  diamond: "Diamond/rhombus shape",
  cylinder: "Cylinder shape",
  cloud: "Cloud shape",
  document: "Document shape",
  parallelogram: "Parallelogram shape",
  hexagon: "Hexagon shape",
  triangle: "Triangle shape",
  process: "Process shape (rectangle with vertical bars)",
  callout: "Callout/speech bubble shape",
  actor: "UML actor (stick figure)",
  database: "Database shape",
};

export function registerListStylesTool(server: McpServer): void {
  server.tool(
    "list_styles",
    "List all available shape style presets",
    {},
    () => {
      const result: Record<
        string,
        { style: string; description: string }
      > = {};

      for (const [name, styleRecord] of Object.entries(PRESETS)) {
        result[name] = {
          style: buildStyle(styleRecord),
          description: DESCRIPTIONS[name] ?? name,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
