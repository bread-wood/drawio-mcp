import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { readDiagram, writeDiagram } from "./parser.js";
import { compressDiagramContent } from "./compress.js";
import { writeFile } from "node:fs/promises";
import type { Diagram } from "../model/diagram.js";

function tmpFile(): string {
  return join(tmpdir(), `drawio-test-${randomUUID()}.drawio`);
}

const cleanupFiles: string[] = [];

afterEach(async () => {
  for (const f of cleanupFiles) {
    try {
      await unlink(f);
    } catch {
      // ignore
    }
  }
  cleanupFiles.length = 0;
});

describe("parser round-trip", () => {
  it("write -> read preserves page metadata", async () => {
    const filePath = tmpFile();
    cleanupFiles.push(filePath);

    const diagram: Diagram = {
      pages: [
        { id: "page-1", name: "First Page", elements: [] },
        { id: "page-2", name: "Second Page", elements: [] },
      ],
    };

    await writeDiagram(filePath, diagram);
    const result = await readDiagram(filePath);

    expect(result.pages).toHaveLength(2);
    expect(result.pages[0].id).toBe("page-1");
    expect(result.pages[0].name).toBe("First Page");
    expect(result.pages[1].id).toBe("page-2");
    expect(result.pages[1].name).toBe("Second Page");
  });

  it("write -> read preserves vertex elements", async () => {
    const filePath = tmpFile();
    cleanupFiles.push(filePath);

    const diagram: Diagram = {
      pages: [
        {
          id: "p1",
          name: "Page-1",
          elements: [
            {
              id: "v1",
              type: "vertex",
              label: "Hello",
              style: { rounded: "1", whiteSpace: "wrap", html: "1" },
              parent: "1",
              geometry: { x: 100, y: 50, width: 120, height: 60 },
            },
            {
              id: "v2",
              type: "vertex",
              label: "World",
              style: { shape: "ellipse", html: "1" },
              parent: "1",
              geometry: { x: 300, y: 200, width: 80, height: 80 },
            },
          ],
        },
      ],
    };

    await writeDiagram(filePath, diagram);
    const result = await readDiagram(filePath);

    expect(result.pages[0].elements).toHaveLength(2);

    const v1 = result.pages[0].elements[0];
    expect(v1.id).toBe("v1");
    expect(v1.type).toBe("vertex");
    expect(v1.label).toBe("Hello");
    expect(v1.style.rounded).toBe("1");
    expect(v1.style.whiteSpace).toBe("wrap");
    expect(v1.geometry).toEqual({ x: 100, y: 50, width: 120, height: 60 });

    const v2 = result.pages[0].elements[1];
    expect(v2.id).toBe("v2");
    expect(v2.type).toBe("vertex");
    expect(v2.label).toBe("World");
    expect(v2.style.shape).toBe("ellipse");
    expect(v2.geometry).toEqual({ x: 300, y: 200, width: 80, height: 80 });
  });

  it("write -> read preserves edge elements", async () => {
    const filePath = tmpFile();
    cleanupFiles.push(filePath);

    const diagram: Diagram = {
      pages: [
        {
          id: "p1",
          name: "Page-1",
          elements: [
            {
              id: "v1",
              type: "vertex",
              label: "A",
              style: { rounded: "0" },
              parent: "1",
              geometry: { x: 0, y: 0, width: 100, height: 50 },
            },
            {
              id: "v2",
              type: "vertex",
              label: "B",
              style: { rounded: "0" },
              parent: "1",
              geometry: { x: 200, y: 0, width: 100, height: 50 },
            },
            {
              id: "e1",
              type: "edge",
              label: "connects",
              style: { edgeStyle: "orthogonalEdgeStyle" },
              parent: "1",
              source: "v1",
              target: "v2",
            },
          ],
        },
      ],
    };

    await writeDiagram(filePath, diagram);
    const result = await readDiagram(filePath);

    const edge = result.pages[0].elements.find((e) => e.type === "edge");
    expect(edge).toBeDefined();
    expect(edge!.id).toBe("e1");
    expect(edge!.label).toBe("connects");
    expect(edge!.source).toBe("v1");
    expect(edge!.target).toBe("v2");
    expect(edge!.style.edgeStyle).toBe("orthogonalEdgeStyle");
    // Edges should not have absolute geometry
    expect(edge!.geometry).toBeUndefined();
  });

  it("write -> read preserves empty label", async () => {
    const filePath = tmpFile();
    cleanupFiles.push(filePath);

    const diagram: Diagram = {
      pages: [
        {
          id: "p1",
          name: "Page-1",
          elements: [
            {
              id: "v1",
              type: "vertex",
              label: "",
              style: { html: "1" },
              parent: "1",
              geometry: { x: 0, y: 0, width: 50, height: 50 },
            },
          ],
        },
      ],
    };

    await writeDiagram(filePath, diagram);
    const result = await readDiagram(filePath);
    expect(result.pages[0].elements[0].label).toBe("");
  });
});

describe("reading compressed content", () => {
  it("reads a compressed diagram", async () => {
    const filePath = tmpFile();
    cleanupFiles.push(filePath);

    // Build uncompressed inner XML matching the mxGraphModel structure
    const innerXml = [
      "<mxGraphModel>",
      "<root>",
      '<mxCell id="0"/>',
      '<mxCell id="1" parent="0"/>',
      '<mxCell id="v1" value="Compressed" style="rounded=1;html=1;" vertex="1" parent="1">',
      '<mxGeometry x="10" y="20" width="100" height="50" as="geometry"/>',
      "</mxCell>",
      "</root>",
      "</mxGraphModel>",
    ].join("");

    const compressed = compressDiagramContent(innerXml);

    // Write a file with compressed content (text node inside <diagram>)
    const xml = [
      '<mxfile host="drawio-mcp" agent="drawio-mcp/0.1.0">',
      `<diagram id="p1" name="Compressed Page">${compressed}</diagram>`,
      "</mxfile>",
    ].join("\n");

    await writeFile(filePath, xml, "utf8");

    const result = await readDiagram(filePath);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].id).toBe("p1");
    expect(result.pages[0].name).toBe("Compressed Page");
    expect(result.pages[0].elements).toHaveLength(1);

    const el = result.pages[0].elements[0];
    expect(el.id).toBe("v1");
    expect(el.type).toBe("vertex");
    expect(el.label).toBe("Compressed");
    expect(el.style.rounded).toBe("1");
    expect(el.geometry).toEqual({ x: 10, y: 20, width: 100, height: 50 });
  });
});

describe("error handling", () => {
  it("throws on missing file", async () => {
    await expect(readDiagram("/nonexistent/path.drawio")).rejects.toThrow();
  });

  it("throws on invalid XML (no mxfile)", async () => {
    const filePath = tmpFile();
    cleanupFiles.push(filePath);
    await writeFile(filePath, "<html><body>not a drawio file</body></html>", "utf8");
    await expect(readDiagram(filePath)).rejects.toThrow("missing <mxfile>");
  });
});
