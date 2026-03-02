# drawio-mcp

A standalone MCP (Model Context Protocol) server for creating, editing, and exporting Draw.io diagrams.

## Motivation

The original `drawio-mcp` package (Sujimoshi) crashes on Node.js v25+ because `global.navigator` became read-only. This project is a lightweight replacement that uses pure XML manipulation instead of mxGraph or JSDOM, making it compatible with modern Node.js runtimes.

## Installation

```bash
git clone https://github.com/bread-wood/drawio-mcp.git
cd drawio-mcp
npm install
npm run build
```

## MCP Configuration

Add the server to your Claude Code `settings.json`:

```json
{
  "mcpServers": {
    "drawio": {
      "command": "node",
      "args": ["/path/to/drawio-mcp/dist/index.js"]
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `create_diagram` | Create a new `.drawio` file with one or more named pages |
| `get_diagram` | Read a `.drawio` file and return its structure as JSON |
| `add_elements` | Add vertex/shape elements to a diagram page |
| `add_connections` | Add edge/connection elements between existing vertices |
| `update_elements` | Update labels, styles, and geometry of existing elements |
| `remove_elements` | Remove elements by ID with cascade deletion of connected edges |
| `export_diagram` | Export a diagram to PNG or SVG using the Draw.io CLI |
| `list_styles` | List all available shape style presets |

## Development

```bash
npm install         # install dependencies
npm run build       # compile TypeScript
npm run dev         # watch mode
npm test            # run tests (vitest)
npm run lint        # lint (eslint)
```

## License

MIT
