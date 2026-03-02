# High-Level Design: drawio-mcp v0.1

## Problem Statement

The existing `drawio-mcp` npm package (Sujimoshi/drawio-mcp v1.6.0) crashes on Node.js
v25+ because it assigns to `global.navigator`, which became read-only in recent V8/Node
versions. The package depends on mxGraph and JSDOM for XML manipulation, making it heavy
and fragile.

We need a lightweight, standalone MCP server that provides full CRUD operations on
Draw.io diagrams without the mxGraph/JSDOM dependency chain.

## Goals

1. **Create, read, modify, and delete** diagram elements (shapes, connections, pages)
2. **Export** diagrams to PNG and SVG via the draw.io desktop CLI
3. **No mxGraph or JSDOM dependency** — pure XML manipulation
4. **Batch-first API** — mutation tools accept arrays for efficiency
5. **Stateless** — every tool call specifies the file path; no server-side state
6. **Git-friendly output** — emit uncompressed XML for clean diffs
7. **Compatible input** — read both compressed and uncompressed .drawio files

## Architecture

```
┌──────────────────────────────────────────────┐
│              MCP Client (Claude)             │
└──────────────────┬───────────────────────────┘
                   │ stdio (JSON-RPC)
┌──────────────────▼───────────────────────────┐
│            drawio-mcp server                 │
│                                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────────┐  │
│  │  Tools  │→ │  Model  │→ │  XML Layer  │  │
│  │ (8 ops) │  │ (types) │  │ (parse/emit)│  │
│  └─────────┘  └─────────┘  └──────┬──────┘  │
│                                    │         │
│                              ┌─────▼──────┐  │
│                              │ Filesystem  │  │
│                              │ (.drawio)   │  │
│                              └────────────┘  │
│                                              │
│  ┌───────────────────────────────────────┐   │
│  │  Export (optional, shells to drawio)  │   │
│  └───────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

**Transport**: stdio (standard MCP transport for local tools)

**Runtime**: Node.js 22+, TypeScript, ES modules

## Tool Surface

| # | Tool | Description |
|---|------|-------------|
| 1 | `create_diagram` | Create a new .drawio file with optional page names |
| 2 | `get_diagram` | Read and inspect diagram structure (pages, elements, connections) |
| 3 | `add_elements` | Batch-add shapes/vertices with positioning and styling |
| 4 | `add_connections` | Batch-add edges between elements |
| 5 | `update_elements` | Modify properties (style, label, position, size) of existing elements |
| 6 | `remove_elements` | Delete elements by ID |
| 7 | `export_diagram` | Export to PNG or SVG via draw.io CLI |
| 8 | `list_styles` | List available shape presets (rectangle, ellipse, cylinder, etc.) |

All mutation tools (3–6) are **batch-first**: they accept an array of operations in a
single call, reducing round trips.

## File Format

### Output Format

The server always writes **uncompressed XML**. This is the native .drawio format with
the full mxGraphModel visible inside each `<diagram>` element:

```xml
<mxfile host="drawio-mcp" modified="2026-03-01T00:00:00.000Z" agent="drawio-mcp/0.1.0">
  <diagram id="page-1" name="Page-1">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <!-- shapes and edges here -->
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

Uncompressed XML is preferred because:
- Git diffs are readable and meaningful
- No decompression step needed for inspection
- Simpler to debug and validate

### Input Format

The server reads **both compressed and uncompressed** .drawio files. Compressed diagrams
store the mxGraphModel as a base64-encoded, deflated, URL-encoded string inside the
`<diagram>` text content. The server detects and decompresses this transparently.

## Key Design Decisions

### 1. No mxGraph/JSDOM

The original drawio-mcp package imports mxGraph (which depends on JSDOM and assigns
`global.navigator`). We avoid this entirely by treating .drawio files as plain XML and
manipulating them with a lightweight XML parser (`fast-xml-parser`).

This eliminates the Node.js compatibility issue and keeps the dependency tree small.

### 2. Stateless Design

Every tool call includes the `filePath` parameter. The server reads the file, applies
the operation, writes back, and returns the result. No in-memory diagram state is held
between calls.

This simplifies the server, avoids stale state bugs, and makes it safe to use with
files that may be edited externally between calls.

### 3. Batch-First API

Rather than adding one shape per tool call, `add_elements` accepts an array of shapes.
This reduces MCP round trips and lets the client build complex diagrams efficiently.

### 4. Style Presets

The `list_styles` tool returns named presets (e.g., "rectangle", "ellipse", "cylinder",
"cloud", "database") that map to mxGraph style strings. Users can reference a preset
name instead of constructing raw style strings.

Custom styles are always supported — presets are a convenience, not a restriction.

### 5. Export via CLI

PNG/SVG export shells out to the `drawio` desktop application CLI:
```
drawio --export --format png --output output.png input.drawio
```

This requires draw.io desktop to be installed. The export tool checks for availability
and returns a clear error if the CLI is not found. No headless browser or Puppeteer
dependency is needed.

## Non-Goals (v0.1)

- **Real-time collaboration** — this is a single-user local tool
- **Diagram validation** — we don't enforce valid diagram topology
- **Custom shape libraries** — presets only; custom stencils are out of scope
- **Web transport** — stdio only; no HTTP/SSE server
- **Compressed output** — we always write uncompressed XML
