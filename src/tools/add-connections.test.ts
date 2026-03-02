import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createServer } from "../server.js";
import { readDiagram, writeDiagram } from "../xml/parser.js";
import type { Diagram, DiagramElement } from "../model/diagram.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

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

async function setupClient(): Promise<Client> {
  const server = createServer();
  const client = new Client({ name: "test-client", version: "0.0.1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);
  return client;
}

function makeVertex(id: string, label: string): DiagramElement {
  return {
    id,
    type: "vertex",
    label,
    style: { rounded: "1", whiteSpace: "wrap", html: "1" },
    parent: "1",
    geometry: { x: 0, y: 0, width: 120, height: 60 },
  };
}

async function createDiagramWithVertices(filePath: string, vertices: DiagramElement[]): Promise<void> {
  const diagram: Diagram = {
    pages: [{ id: "page-1", name: "Page-1", elements: vertices }],
  };
  await writeDiagram(filePath, diagram);
}

describe("add_connections", () => {
  it("adds a connection between two elements with correct source and target", async () => {
    const client = await setupClient();
    const filePath = tmpFile();
    cleanupFiles.push(filePath);
    await createDiagramWithVertices(filePath, [
      makeVertex("v1", "A"),
      makeVertex("v2", "B"),
    ]);

    const result = await client.callTool({
      name: "add_connections",
      arguments: {
        filePath,
        pageIndex: 0,
        connections: [
          { id: "e1", source: "v1", target: "v2" },
        ],
      },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(content[0].text);
    expect(parsed.created).toEqual(["e1"]);

    const diagram = await readDiagram(filePath);
    const edges = diagram.pages[0].elements.filter((el) => el.type === "edge");
    expect(edges).toHaveLength(1);
    expect(edges[0].id).toBe("e1");
    expect(edges[0].source).toBe("v1");
    expect(edges[0].target).toBe("v2");
    expect(edges[0].style["edgeStyle"]).toBe("orthogonalEdgeStyle");
    expect(edges[0].style["rounded"]).toBe("1");
  });

  it("returns error for invalid source element", async () => {
    const client = await setupClient();
    const filePath = tmpFile();
    cleanupFiles.push(filePath);
    await createDiagramWithVertices(filePath, [
      makeVertex("v1", "A"),
      makeVertex("v2", "B"),
    ]);

    const result = await client.callTool({
      name: "add_connections",
      arguments: {
        filePath,
        pageIndex: 0,
        connections: [
          { source: "nonexistent", target: "v2" },
        ],
      },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(result.isError).toBe(true);
    expect(content[0].text).toContain('source element "nonexistent" not found');
  });

  it("returns error for invalid target element", async () => {
    const client = await setupClient();
    const filePath = tmpFile();
    cleanupFiles.push(filePath);
    await createDiagramWithVertices(filePath, [
      makeVertex("v1", "A"),
      makeVertex("v2", "B"),
    ]);

    const result = await client.callTool({
      name: "add_connections",
      arguments: {
        filePath,
        pageIndex: 0,
        connections: [
          { source: "v1", target: "nonexistent" },
        ],
      },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(result.isError).toBe(true);
    expect(content[0].text).toContain('target element "nonexistent" not found');
  });

  it("adds a batch of connections and verifies all present", async () => {
    const client = await setupClient();
    const filePath = tmpFile();
    cleanupFiles.push(filePath);
    await createDiagramWithVertices(filePath, [
      makeVertex("v1", "A"),
      makeVertex("v2", "B"),
      makeVertex("v3", "C"),
    ]);

    const result = await client.callTool({
      name: "add_connections",
      arguments: {
        filePath,
        pageIndex: 0,
        connections: [
          { id: "e1", source: "v1", target: "v2" },
          { id: "e2", source: "v2", target: "v3" },
          { id: "e3", source: "v1", target: "v3" },
        ],
      },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(content[0].text);
    expect(parsed.created).toEqual(["e1", "e2", "e3"]);

    const diagram = await readDiagram(filePath);
    const edges = diagram.pages[0].elements.filter((el) => el.type === "edge");
    expect(edges).toHaveLength(3);

    expect(edges[0].source).toBe("v1");
    expect(edges[0].target).toBe("v2");
    expect(edges[1].source).toBe("v2");
    expect(edges[1].target).toBe("v3");
    expect(edges[2].source).toBe("v1");
    expect(edges[2].target).toBe("v3");
  });

  it("preserves custom label on connection", async () => {
    const client = await setupClient();
    const filePath = tmpFile();
    cleanupFiles.push(filePath);
    await createDiagramWithVertices(filePath, [
      makeVertex("v1", "A"),
      makeVertex("v2", "B"),
    ]);

    const result = await client.callTool({
      name: "add_connections",
      arguments: {
        filePath,
        pageIndex: 0,
        connections: [
          { id: "e1", label: "connects to", source: "v1", target: "v2" },
        ],
      },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(result.isError).toBeFalsy();

    const diagram = await readDiagram(filePath);
    const edges = diagram.pages[0].elements.filter((el) => el.type === "edge");
    expect(edges).toHaveLength(1);
    expect(edges[0].label).toBe("connects to");
  });

  it("auto-generates numeric IDs when not provided", async () => {
    const client = await setupClient();
    const filePath = tmpFile();
    cleanupFiles.push(filePath);
    await createDiagramWithVertices(filePath, [
      makeVertex("2", "A"),
      makeVertex("3", "B"),
    ]);

    const result = await client.callTool({
      name: "add_connections",
      arguments: {
        filePath,
        pageIndex: 0,
        connections: [
          { source: "2", target: "3" },
          { source: "3", target: "2" },
        ],
      },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(content[0].text);
    expect(parsed.created).toEqual(["4", "5"]);
  });

  it("merges custom style with default edge style", async () => {
    const client = await setupClient();
    const filePath = tmpFile();
    cleanupFiles.push(filePath);
    await createDiagramWithVertices(filePath, [
      makeVertex("v1", "A"),
      makeVertex("v2", "B"),
    ]);

    const result = await client.callTool({
      name: "add_connections",
      arguments: {
        filePath,
        pageIndex: 0,
        connections: [
          {
            id: "e1",
            source: "v1",
            target: "v2",
            style: { strokeColor: "#FF0000", rounded: "0" },
          },
        ],
      },
    });

    expect(result.isError).toBeFalsy();

    const diagram = await readDiagram(filePath);
    const edge = diagram.pages[0].elements.find((el) => el.id === "e1");
    expect(edge).toBeDefined();
    // Default style property should be present
    expect(edge!.style["edgeStyle"]).toBe("orthogonalEdgeStyle");
    // Custom override should take precedence
    expect(edge!.style["rounded"]).toBe("0");
    // Custom property should be present
    expect(edge!.style["strokeColor"]).toBe("#FF0000");
  });
});
