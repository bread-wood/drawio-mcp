import type { Geometry } from "../model/diagram.js";

// fast-xml-parser v5 preserveOrder node: plain object with dynamic keys.
export type XNode = Record<string, unknown>;

export function buildVertexCell(
  id: string,
  label: string,
  style: string,
  geometry: Geometry,
): XNode {
  return {
    mxCell: [
      {
        mxGeometry: [],
        ":@": {
          "@_x": String(geometry.x),
          "@_y": String(geometry.y),
          "@_width": String(geometry.width),
          "@_height": String(geometry.height),
          "@_as": "geometry",
        },
      },
    ],
    ":@": {
      "@_id": id,
      "@_value": label,
      "@_style": style,
      "@_vertex": "1",
      "@_parent": "1",
    },
  };
}

export function buildEdgeCell(
  id: string,
  label: string,
  style: string,
  source: string,
  target: string,
): XNode {
  return {
    mxCell: [
      {
        mxGeometry: [],
        ":@": {
          "@_relative": "1",
          "@_as": "geometry",
        },
      },
    ],
    ":@": {
      "@_id": id,
      "@_value": label,
      "@_style": style,
      "@_edge": "1",
      "@_source": source,
      "@_target": target,
      "@_parent": "1",
    },
  };
}
