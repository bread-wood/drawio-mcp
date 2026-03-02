export interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DiagramElement {
  id: string;
  type: "vertex" | "edge";
  label: string;
  style: Record<string, string>;
  parent: string;
  // Vertex-specific
  geometry?: Geometry;
  // Edge-specific
  source?: string;
  target?: string;
}

export interface Page {
  id: string;
  name: string;
  elements: DiagramElement[];
}

export interface Diagram {
  pages: Page[];
}
