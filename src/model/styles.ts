// Parse a draw.io style string like "rounded=1;whiteSpace=wrap;html=1;" into a Record.
// Handles bare prefixes (e.g. "text;" where the first segment has no =) by storing them
// as the empty-string key.
export function parseStyle(styleString: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!styleString) return result;

  const segments = styleString.split(";").filter((s) => s.length > 0);
  for (const segment of segments) {
    const eqIndex = segment.indexOf("=");
    if (eqIndex === -1) {
      // Bare prefix like "text" — store under empty key
      result[""] = segment;
    } else {
      const key = segment.substring(0, eqIndex);
      const value = segment.substring(eqIndex + 1);
      result[key] = value;
    }
  }
  return result;
}

// Build a draw.io style string from a Record. Always ends with a semicolon.
export function buildStyle(style: Record<string, string>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(style)) {
    if (key === "") {
      // Bare prefix — emit without =
      parts.push(value);
    } else {
      parts.push(`${key}=${value}`);
    }
  }
  return parts.length > 0 ? parts.join(";") + ";" : "";
}

export const PRESETS: Record<string, Record<string, string>> = {
  rectangle: parseStyle("rounded=0;whiteSpace=wrap;html=1;"),
  rounded_rectangle: parseStyle("rounded=1;whiteSpace=wrap;html=1;"),
  ellipse: parseStyle("shape=ellipse;whiteSpace=wrap;html=1;"),
  diamond: parseStyle("shape=rhombus;whiteSpace=wrap;html=1;"),
  cylinder: parseStyle("shape=cylinder3;whiteSpace=wrap;html=1;size=15;"),
  cloud: parseStyle("shape=cloud;whiteSpace=wrap;html=1;"),
  document: parseStyle("shape=document;whiteSpace=wrap;html=1;"),
  parallelogram: parseStyle("shape=parallelogram;whiteSpace=wrap;html=1;"),
  hexagon: parseStyle("shape=hexagon;whiteSpace=wrap;html=1;size=0.25;"),
  triangle: parseStyle("shape=triangle;whiteSpace=wrap;html=1;"),
  process: parseStyle("shape=process;whiteSpace=wrap;html=1;"),
  callout: parseStyle("shape=callout;whiteSpace=wrap;html=1;size=20;position=0.5;"),
  actor: parseStyle("shape=umlActor;verticalLabelPosition=bottom;html=1;"),
  database: parseStyle("shape=mxgraph.flowchart.database;whiteSpace=wrap;html=1;"),
};
