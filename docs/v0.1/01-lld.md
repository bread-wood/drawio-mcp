# Low-Level Design: drawio-mcp v0.1

## XML Format Reference

### Document Hierarchy

```
mxfile                          ← document root
├── @host, @modified, @agent    ← metadata attributes
└── diagram[]                   ← one per page
    ├── @id, @name              ← page identity
    └── mxGraphModel            ← graph container
        ├── @dx, @dy, @grid, @gridSize, @page, @pageScale, @pageWidth, @pageHeight
        └── root                ← cell container
            ├── mxCell id="0"   ← base layer (required)
            ├── mxCell id="1"   ← default parent layer (required)
            ├── mxCell          ← vertex (shape) or edge (connection)
            │   └── mxGeometry  ← position and dimensions
            └── object          ← vertex with custom properties
                └── mxCell
                    └── mxGeometry
```

### Required Root Cells

Every page must contain two root cells:

```xml
<mxCell id="0"/>                 <!-- base layer -->
<mxCell id="1" parent="0"/>      <!-- default layer, parent of all user cells -->
```

### Vertex (Shape)

```xml
<mxCell id="shape-1" value="Hello" style="rounded=1;whiteSpace=wrap;html=1;"
        vertex="1" parent="1">
  <mxGeometry x="100" y="50" width="120" height="60" as="geometry"/>
</mxCell>
```

Key attributes:
- `id` — unique identifier within the diagram
- `value` — display label (supports HTML when `html=1` in style)
- `style` — semicolon-separated key=value pairs
- `vertex="1"` — marks this cell as a shape (not an edge)
- `parent="1"` — parent layer (default layer)

### Edge (Connection)

```xml
<mxCell id="edge-1" value="" style="edgeStyle=orthogonalEdgeStyle;" edge="1"
        source="shape-1" target="shape-2" parent="1">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
```

Key attributes:
- `edge="1"` — marks this cell as a connection
- `source` — ID of the source vertex
- `target` — ID of the target vertex
- `relative="1"` on geometry — position is relative to source/target

### Object Wrapper

For elements with custom metadata properties:

```xml
<object id="obj-1" label="Component" customProp="value">
  <mxCell style="shape=rectangle;" vertex="1" parent="1">
    <mxGeometry x="200" y="100" width="80" height="40" as="geometry"/>
  </mxCell>
</object>
```

The `object` wrapper allows arbitrary attributes that aren't part of the mxCell spec.

### Compressed Format

When compressed, the `<diagram>` element contains a text node instead of an
`<mxGraphModel>` child:

```xml
<diagram id="page-1" name="Page-1">
  7V1bc6M4Fv41fowLJO4P2Ol0z1T1...  (base64 string)
</diagram>
```

**Decompression pipeline**: base64 decode → inflate (raw deflate, wbits=-15) → URL decode → XML string

**Compression pipeline** (for reference only — we always write uncompressed):
XML string → URL encode → deflate (raw, wbits=-15) → base64 encode

## Module Structure

```
src/
├── index.ts                ← entry point: creates server, connects stdio transport
├── server.ts               ← McpServer setup, registers all tools
├── xml/
│   ├── parser.ts           ← readDiagram(filePath), writeDiagram(filePath, diagram)
│   ├── compress.ts         ← inflate/deflate helpers for compressed format
│   └── builder.ts          ← buildMxCell(), buildMxGeometry() helpers
├── model/
│   ├── diagram.ts          ← TypeScript types: Diagram, Page, Element, Connection
│   └── styles.ts           ← parseStyle(), buildStyle(), PRESETS map
├── tools/
│   ├── create-diagram.ts   ← create_diagram tool handler
│   ├── get-diagram.ts      ← get_diagram tool handler
│   ├── add-elements.ts     ← add_elements tool handler
│   ├── add-connections.ts  ← add_connections tool handler
│   ├── update-elements.ts  ← update_elements tool handler
│   ├── remove-elements.ts  ← remove_elements tool handler
│   ├── export-diagram.ts   ← export_diagram tool handler
│   └── list-styles.ts      ← list_styles tool handler
└── export/
    └── renderer.ts         ← shellExport(filePath, format, outputPath)
```

### Module Details

#### `xml/parser.ts`

```typescript
// Read a .drawio file, auto-detecting compressed vs uncompressed
async function readDiagram(filePath: string): Promise<Diagram>

// Write a Diagram back to a .drawio file (always uncompressed)
async function writeDiagram(filePath: string, diagram: Diagram): Promise<void>
```

Uses `fast-xml-parser` with these options:
- `ignoreAttributes: false` — preserve all XML attributes
- `attributeNamePrefix: "@_"` — distinguish attributes from child elements
- `allowBooleanAttributes: true` — handle `vertex`, `edge` flags
- `preserveOrder: true` — maintain element ordering for stable output

The parser detects compressed content by checking if the `<diagram>` element has text
content instead of an `<mxGraphModel>` child. If compressed, it delegates to
`xml/compress.ts` for decompression.

#### `xml/compress.ts`

```typescript
// Decompress diagram content: base64 → inflate → URL-decode
function decompressDiagramContent(encoded: string): string

// Compress diagram content: URL-encode → deflate → base64 (for reference/testing)
function compressDiagramContent(xml: string): string
```

Uses Node.js built-in `zlib.inflateRaw()` and `zlib.deflateRaw()` (no external deps).

#### `xml/builder.ts`

```typescript
// Build an mxCell XML object for a vertex
function buildVertexCell(id: string, label: string, style: string,
                         geometry: Geometry): MxCellNode

// Build an mxCell XML object for an edge
function buildEdgeCell(id: string, label: string, style: string,
                       source: string, target: string): MxCellNode
```

Returns objects in the shape expected by `fast-xml-parser`'s builder.

#### `model/diagram.ts`

```typescript
interface Diagram {
  pages: Page[];
}

interface Page {
  id: string;
  name: string;
  elements: DiagramElement[];
}

interface DiagramElement {
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

interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

#### `model/styles.ts`

```typescript
// Parse "rounded=1;fillColor=#fff;..." into { rounded: "1", fillColor: "#fff" }
function parseStyle(styleString: string): Record<string, string>

// Build "rounded=1;fillColor=#fff;" from { rounded: "1", fillColor: "#fff" }
function buildStyle(style: Record<string, string>): string

// Named presets
const PRESETS: Record<string, Record<string, string>>
```

**Preset definitions**:

| Preset | Key Style Properties |
|--------|---------------------|
| `rectangle` | `rounded=0;whiteSpace=wrap;html=1;` |
| `rounded_rectangle` | `rounded=1;whiteSpace=wrap;html=1;` |
| `ellipse` | `shape=ellipse;whiteSpace=wrap;html=1;` |
| `diamond` | `shape=rhombus;whiteSpace=wrap;html=1;` |
| `cylinder` | `shape=cylinder3;whiteSpace=wrap;html=1;size=15;` |
| `cloud` | `shape=cloud;whiteSpace=wrap;html=1;` |
| `document` | `shape=document;whiteSpace=wrap;html=1;` |
| `parallelogram` | `shape=parallelogram;whiteSpace=wrap;html=1;` |
| `hexagon` | `shape=hexagon;whiteSpace=wrap;html=1;size=0.25;` |
| `triangle` | `shape=triangle;whiteSpace=wrap;html=1;` |
| `process` | `shape=process;whiteSpace=wrap;html=1;` |
| `callout` | `shape=callout;whiteSpace=wrap;html=1;size=20;position=0.5;` |
| `actor` | `shape=umlActor;verticalLabelPosition=bottom;html=1;` |
| `database` | `shape=mxgraph.flowchart.database;whiteSpace=wrap;html=1;` |

Presets can be extended with additional style properties. For example:
```json
{ "preset": "rectangle", "fillColor": "#dae8fc", "strokeColor": "#6c8ebf" }
```

## Tool Specifications

### 1. `create_diagram`

**Input** (Zod schema):
```typescript
{
  filePath: z.string(),                    // path to create
  pages: z.array(z.string()).optional(),   // page names, default: ["Page-1"]
}
```

**Behavior**: Creates a new .drawio file with the specified pages. Each page gets the
two required root cells (id=0, id=1). Fails if the file already exists.

**Output**: Confirmation message with page count.

### 2. `get_diagram`

**Input**:
```typescript
{
  filePath: z.string(),
  pageIndex: z.number().optional(),  // return only this page (0-indexed)
}
```

**Behavior**: Reads and parses the file. Returns structured diagram info: page names,
element counts, and element details (id, type, label, style, geometry).

**Output**: JSON representation of the diagram structure.

### 3. `add_elements`

**Input**:
```typescript
{
  filePath: z.string(),
  pageIndex: z.number().default(0),
  elements: z.array(z.object({
    id: z.string().optional(),              // auto-generated if omitted
    label: z.string().default(""),
    preset: z.string().optional(),          // e.g., "rectangle", "ellipse"
    style: z.record(z.string()).optional(), // custom style overrides
    x: z.number().default(0),
    y: z.number().default(0),
    width: z.number().default(120),
    height: z.number().default(60),
  })),
}
```

**Behavior**: Adds vertex cells to the specified page. If `preset` is given, uses the
preset style as a base and merges any custom `style` overrides. Auto-generates IDs by
finding the max numeric ID in the page and incrementing.

**Output**: Array of created element IDs.

### 4. `add_connections`

**Input**:
```typescript
{
  filePath: z.string(),
  pageIndex: z.number().default(0),
  connections: z.array(z.object({
    id: z.string().optional(),
    label: z.string().default(""),
    source: z.string(),                    // source element ID
    target: z.string(),                    // target element ID
    style: z.record(z.string()).optional(),
  })),
}
```

**Behavior**: Adds edge cells connecting source to target vertices. Validates that
source and target IDs exist in the page. Default edge style:
`edgeStyle=orthogonalEdgeStyle;rounded=1;`.

**Output**: Array of created edge IDs.

### 5. `update_elements`

**Input**:
```typescript
{
  filePath: z.string(),
  pageIndex: z.number().default(0),
  updates: z.array(z.object({
    id: z.string(),                          // element to update
    label: z.string().optional(),            // new label
    style: z.record(z.string()).optional(),  // style properties to merge
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  })),
}
```

**Behavior**: Finds elements by ID and applies updates. Style updates are **merged** —
only specified properties change, others are preserved. Geometry updates are applied
field-by-field (you can update just `x` without touching `y`).

**Output**: Count of updated elements.

### 6. `remove_elements`

**Input**:
```typescript
{
  filePath: z.string(),
  pageIndex: z.number().default(0),
  ids: z.array(z.string()),
}
```

**Behavior**: Removes elements (vertices or edges) by ID. Also removes any edges that
reference a removed vertex as source or target (cascade delete). Returns the IDs of
all removed elements (including cascaded edges).

**Output**: Array of removed element IDs.

### 7. `export_diagram`

**Input**:
```typescript
{
  filePath: z.string(),
  format: z.enum(["png", "svg"]),
  outputPath: z.string().optional(),       // defaults to filePath with new extension
  pageIndex: z.number().optional(),        // export specific page
  scale: z.number().optional(),            // export scale factor
}
```

**Behavior**: Shells out to the `drawio` CLI:
```bash
drawio --export --format <format> --output <outputPath> [--page-index <n>] [--scale <s>] <filePath>
```

On macOS, the CLI is typically at:
`/Applications/draw.io.app/Contents/MacOS/draw.io`

Checks for CLI availability first and returns a helpful error if not found.

**Output**: Path to the exported file.

### 8. `list_styles`

**Input**: none (empty object)

**Behavior**: Returns the preset map from `model/styles.ts`.

**Output**: JSON object mapping preset names to their style properties and a visual
description of each shape.

## ID Generation

When a tool call doesn't provide an explicit `id`:

1. Scan all existing cells in the target page
2. Find the maximum numeric ID (parse as integer, skip non-numeric IDs)
3. New ID = max + 1, as a string

This produces sequential numeric IDs (e.g., "2", "3", "4") which is consistent with
how draw.io itself generates IDs. User-supplied IDs are used as-is — they can be any
string.

## Geometry Model

Vertices use absolute geometry:
```xml
<mxGeometry x="100" y="50" width="120" height="60" as="geometry"/>
```

- `x`, `y` — top-left corner position (pixels from diagram origin)
- `width`, `height` — shape dimensions in pixels
- Coordinate system: x increases rightward, y increases downward

Edges use relative geometry:
```xml
<mxGeometry relative="1" as="geometry"/>
```

No waypoint support in v0.1 — edges route automatically based on their `edgeStyle`.

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@modelcontextprotocol/sdk` | ^1.12 | MCP server framework |
| `fast-xml-parser` | ^5.2 | XML parsing and building |
| `zod` | ^3.24 | Input validation |

**Dev dependencies**:

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^5.8 | Type checking and compilation |
| `vitest` | ^3.1 | Test runner |
| `@types/node` | ^22 | Node.js type definitions |

## Testing Strategy

**Unit tests** (`src/**/*.test.ts`):
- `xml/parser.test.ts` — round-trip: build diagram → write XML → read XML → verify
- `xml/compress.test.ts` — decompress known compressed content, verify output
- `model/styles.test.ts` — parseStyle/buildStyle round-trip, preset validity
- `xml/builder.test.ts` — verify generated XML structure

**Integration tests** (`src/tools/*.test.ts`):
- Create diagram → add elements → get diagram → verify structure
- Create → add elements → add connections → verify edges link correct vertices
- Create → add → update → verify changes applied
- Create → add → remove → verify cascade deletion of orphan edges
- Create → add elements → update style → verify style merge behavior

Tests use temporary files (`os.tmpdir()`) and clean up after themselves.

## Error Handling

All tools return MCP-formatted errors:
```typescript
{ content: [{ type: "text", text: "Error: ..." }], isError: true }
```

Common errors:
- File not found (get/update/remove on non-existent file)
- File already exists (create when file exists)
- Element not found (update/remove with invalid ID)
- Source/target not found (add_connections with invalid references)
- draw.io CLI not found (export without draw.io installed)
- Invalid page index (out of range)
