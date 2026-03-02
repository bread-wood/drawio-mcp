import { readFile, writeFile } from "node:fs/promises";
import { XMLParser, XMLBuilder } from "fast-xml-parser";
import type { Diagram, DiagramElement, Geometry, Page } from "../model/diagram.js";
import { parseStyle, buildStyle } from "../model/styles.js";
import { decompressDiagramContent } from "./compress.js";
import { buildVertexCell, buildEdgeCell, type XNode } from "./builder.js";

const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  preserveOrder: true,
};

const builderOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true,
  format: true,
  suppressEmptyNode: true,
};

function getAttrs(node: XNode): Record<string, string> {
  return (node[":@"] as Record<string, string>) ?? {};
}

function getChildren(node: XNode, tag: string): XNode[] {
  const children = node[tag];
  if (Array.isArray(children)) return children as XNode[];
  return [];
}

function findChild(children: XNode[], tag: string): XNode | undefined {
  return children.find((c) => tag in c);
}

// Parse an mxCell node from the preserveOrder structure into a DiagramElement
function parseMxCell(node: XNode): DiagramElement | undefined {
  const attrs = getAttrs(node);
  const id = attrs["@_id"] ?? "";
  const parent = attrs["@_parent"] ?? "1";

  // Skip root cells (id="0" and id="1")
  if (id === "0" || id === "1") return undefined;

  const isEdge = attrs["@_edge"] === "1";
  const isVertex = attrs["@_vertex"] === "1";

  if (!isEdge && !isVertex) return undefined;

  const label = attrs["@_value"] ?? "";
  const styleStr = attrs["@_style"] ?? "";
  const style = parseStyle(styleStr);

  const element: DiagramElement = {
    id,
    type: isEdge ? "edge" : "vertex",
    label,
    style,
    parent,
  };

  if (isEdge) {
    element.source = attrs["@_source"];
    element.target = attrs["@_target"];
  }

  // Parse geometry from child mxGeometry
  const mxCellChildren = getChildren(node, "mxCell");
  const geoNode = findChild(mxCellChildren, "mxGeometry");
  if (geoNode) {
    const geoAttrs = getAttrs(geoNode);
    // Only parse absolute geometry (not relative for edges)
    if (geoAttrs["@_relative"] !== "1") {
      element.geometry = {
        x: Number(geoAttrs["@_x"] ?? "0"),
        y: Number(geoAttrs["@_y"] ?? "0"),
        width: Number(geoAttrs["@_width"] ?? "0"),
        height: Number(geoAttrs["@_height"] ?? "0"),
      };
    }
  }

  return element;
}

// Parse a <diagram> node's content, handling both compressed and uncompressed formats
function parseDiagramContent(diagramChildren: XNode[]): DiagramElement[] {
  // Check if compressed: text node present instead of mxGraphModel child
  const textNode = diagramChildren.find((c) => "#text" in c);
  let rootNodes: XNode[];

  if (textNode) {
    // Compressed: decompress and re-parse
    const compressed = textNode["#text"] as string;
    const xmlStr = decompressDiagramContent(compressed);
    const parser = new XMLParser(parserOptions);
    const parsed = parser.parse(xmlStr) as XNode[];
    const graphModel = findChild(parsed, "mxGraphModel");
    if (!graphModel) return [];
    const graphChildren = getChildren(graphModel, "mxGraphModel");
    const rootWrapper = findChild(graphChildren, "root");
    if (!rootWrapper) return [];
    rootNodes = getChildren(rootWrapper, "root");
  } else {
    // Uncompressed: find mxGraphModel -> root
    const graphModel = findChild(diagramChildren, "mxGraphModel");
    if (!graphModel) return [];
    const graphChildren = getChildren(graphModel, "mxGraphModel");
    const rootWrapper = findChild(graphChildren, "root");
    if (!rootWrapper) return [];
    rootNodes = getChildren(rootWrapper, "root");
  }

  const elements: DiagramElement[] = [];
  for (const node of rootNodes) {
    if ("mxCell" in node) {
      const el = parseMxCell(node);
      if (el) elements.push(el);
    }
  }
  return elements;
}

export async function readDiagram(filePath: string): Promise<Diagram> {
  const content = await readFile(filePath, "utf8");
  const parser = new XMLParser(parserOptions);
  const parsed = parser.parse(content) as XNode[];

  const mxfileNode = findChild(parsed, "mxfile");
  if (!mxfileNode) {
    throw new Error("Invalid .drawio file: missing <mxfile> root element");
  }

  const mxfileChildren = getChildren(mxfileNode, "mxfile");
  const pages: Page[] = [];

  for (const child of mxfileChildren) {
    if ("diagram" in child) {
      const attrs = getAttrs(child);
      const pageId = attrs["@_id"] ?? "";
      const pageName = attrs["@_name"] ?? "";
      const diagramChildren = getChildren(child, "diagram");
      const elements = parseDiagramContent(diagramChildren);
      pages.push({ id: pageId, name: pageName, elements });
    }
  }

  return { pages };
}

export async function writeDiagram(filePath: string, diagram: Diagram): Promise<void> {
  const diagramNodes: XNode[] = [];

  for (const page of diagram.pages) {
    const rootCells: XNode[] = [
      { mxCell: [], ":@": { "@_id": "0" } },
      { mxCell: [], ":@": { "@_id": "1", "@_parent": "0" } },
    ];

    for (const el of page.elements) {
      const styleStr = buildStyle(el.style);
      if (el.type === "vertex") {
        const geo: Geometry = el.geometry ?? { x: 0, y: 0, width: 120, height: 60 };
        rootCells.push(buildVertexCell(el.id, el.label, styleStr, geo));
      } else {
        rootCells.push(buildEdgeCell(el.id, el.label, styleStr, el.source ?? "", el.target ?? ""));
      }
    }

    diagramNodes.push({
      diagram: [
        {
          mxGraphModel: [
            { root: rootCells },
          ],
          ":@": {
            "@_dx": "1326",
            "@_dy": "791",
            "@_grid": "1",
            "@_gridSize": "10",
            "@_guides": "1",
            "@_tooltips": "1",
            "@_connect": "1",
            "@_arrows": "1",
            "@_fold": "1",
            "@_page": "1",
            "@_pageScale": "1",
            "@_pageWidth": "850",
            "@_pageHeight": "1100",
            "@_math": "0",
            "@_shadow": "0",
          },
        },
      ],
      ":@": {
        "@_id": page.id,
        "@_name": page.name,
      },
    });
  }

  const xmlData: XNode[] = [
    {
      mxfile: diagramNodes,
      ":@": {
        "@_host": "drawio-mcp",
        "@_modified": new Date().toISOString(),
        "@_agent": "drawio-mcp/0.1.0",
        "@_version": "0.1.0",
      },
    },
  ];

  const builder = new XMLBuilder(builderOptions);
  const xmlStr = builder.build(xmlData) as string;
  await writeFile(filePath, xmlStr, "utf8");
}
