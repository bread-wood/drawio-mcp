import { describe, it, expect } from "vitest";
import { XMLBuilder } from "fast-xml-parser";
import { buildVertexCell, buildEdgeCell, type XNode } from "./builder.js";

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true,
  format: false,
  suppressEmptyNode: true,
});

function attrs(node: XNode): Record<string, string> {
  return node[":@"] as Record<string, string>;
}

function children(node: XNode, tag: string): XNode[] {
  return node[tag] as XNode[];
}

describe("buildVertexCell", () => {
  it("produces correct vertex structure", () => {
    const cell = buildVertexCell("v1", "Hello", "rounded=1;", {
      x: 100,
      y: 50,
      width: 120,
      height: 60,
    });

    const a = attrs(cell);
    expect(a["@_id"]).toBe("v1");
    expect(a["@_value"]).toBe("Hello");
    expect(a["@_style"]).toBe("rounded=1;");
    expect(a["@_vertex"]).toBe("1");
    expect(a["@_parent"]).toBe("1");

    // Check geometry child
    const mxCells = children(cell, "mxCell");
    expect(mxCells).toHaveLength(1);
    const geoAttrs = attrs(mxCells[0]);
    expect(geoAttrs["@_x"]).toBe("100");
    expect(geoAttrs["@_y"]).toBe("50");
    expect(geoAttrs["@_width"]).toBe("120");
    expect(geoAttrs["@_height"]).toBe("60");
    expect(geoAttrs["@_as"]).toBe("geometry");
  });

  it("produces valid XML via XMLBuilder", () => {
    const cell = buildVertexCell("v2", "Test", "html=1;", {
      x: 0,
      y: 0,
      width: 80,
      height: 40,
    });

    const xml = builder.build([cell]) as string;
    expect(xml).toContain('id="v2"');
    expect(xml).toContain('value="Test"');
    expect(xml).toContain('vertex="1"');
    expect(xml).toContain('width="80"');
  });
});

describe("buildEdgeCell", () => {
  it("produces correct edge structure", () => {
    const cell = buildEdgeCell("e1", "connects", "edgeStyle=orthogonalEdgeStyle;", "src", "tgt");

    const a = attrs(cell);
    expect(a["@_id"]).toBe("e1");
    expect(a["@_value"]).toBe("connects");
    expect(a["@_style"]).toBe("edgeStyle=orthogonalEdgeStyle;");
    expect(a["@_edge"]).toBe("1");
    expect(a["@_source"]).toBe("src");
    expect(a["@_target"]).toBe("tgt");
    expect(a["@_parent"]).toBe("1");

    // Check geometry child is relative
    const mxCells = children(cell, "mxCell");
    expect(mxCells).toHaveLength(1);
    const geoAttrs = attrs(mxCells[0]);
    expect(geoAttrs["@_relative"]).toBe("1");
    expect(geoAttrs["@_as"]).toBe("geometry");
  });

  it("produces valid XML via XMLBuilder", () => {
    const cell = buildEdgeCell("e2", "", "edgeStyle=orthogonalEdgeStyle;", "a", "b");

    const xml = builder.build([cell]) as string;
    expect(xml).toContain('id="e2"');
    expect(xml).toContain('edge="1"');
    expect(xml).toContain('source="a"');
    expect(xml).toContain('target="b"');
    expect(xml).toContain('relative="1"');
  });
});
