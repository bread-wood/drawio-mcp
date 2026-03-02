import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { shellExport } from "../export/renderer.js";

const ExportDiagramSchema = {
  filePath: z.string().describe("Path to the .drawio file to export"),
  format: z.enum(["png", "svg"]).describe("Export format"),
  outputPath: z
    .string()
    .optional()
    .describe("Output file path (defaults to filePath with new extension)"),
  pageIndex: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Page index to export (0-based)"),
  scale: z
    .number()
    .positive()
    .optional()
    .describe("Export scale factor"),
};

export function registerExportDiagramTool(server: McpServer): void {
  server.tool(
    "export_diagram",
    "Export a .drawio diagram to PNG or SVG using the draw.io CLI",
    ExportDiagramSchema,
    async ({ filePath, format, outputPath, pageIndex, scale }) => {
      try {
        const result = await shellExport({
          filePath,
          format,
          outputPath,
          pageIndex,
          scale,
        });

        return {
          content: [{ type: "text", text: `Exported to ${result}` }],
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
