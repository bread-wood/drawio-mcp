# drawio-mcp — Claude Code Conventions

## Project Overview

A standalone MCP (Model Context Protocol) server for creating, editing, and exporting
Draw.io diagrams. Built as a lightweight replacement for `drawio-mcp` (Sujimoshi) which
crashes on Node.js v25+ due to `global.navigator` being read-only.

**Repo**: `bread-wood/drawio-mcp`
**Default branch**: `main`
**Runtime**: Node.js 22+, TypeScript 5.8+
**Package manager**: npm

## Repo Layout

```
drawio-mcp/
├── CLAUDE.md          ← you are here
├── package.json
├── tsconfig.json
├── docs/
│   └── v0.1/
│       ├── 00-hld.md  ← high-level design
│       └── 01-lld.md  ← low-level design
└── src/
    ├── index.ts       ← entry point, stdio transport
    ├── server.ts      ← McpServer factory, tool registration
    ├── xml/
    │   ├── parser.ts  ← read/write .drawio XML
    │   ├── compress.ts← deflate/inflate + base64
    │   └── builder.ts ← mxCell construction helpers
    ├── model/
    │   ├── diagram.ts ← Diagram, Page, Element, Connection types
    │   └── styles.ts  ← style string parsing and presets
    ├── tools/
    │   ├── create-diagram.ts
    │   ├── get-diagram.ts
    │   ├── add-elements.ts
    │   ├── add-connections.ts
    │   ├── update-elements.ts
    │   ├── remove-elements.ts
    │   ├── export-diagram.ts
    │   └── list-styles.ts
    └── export/
        └── renderer.ts← draw.io CLI export wrapper
```

## Dev Commands

```bash
npm install         # install dependencies
npm run build       # compile TypeScript
npm run dev         # watch mode
npm test            # run tests (vitest)
npm run lint        # lint (eslint)
```

## Coding Conventions

- **TypeScript strict mode** — no `any`, all functions fully typed
- **ES modules** — `"type": "module"` in package.json
- **Pure XML manipulation** — no mxGraph or JSDOM dependency
- **Batch-first API** — mutation tools accept arrays of operations
- **Stateless** — every tool call specifies the file path
- **Zod schemas** — all tool inputs validated with Zod
- **Vitest** — unit tests colocated as `*.test.ts`
- **No docstrings on obvious code** — only comment non-obvious logic
