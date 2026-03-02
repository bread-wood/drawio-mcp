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

function makeEdge(id: string, source: string, target: string, label = ""): DiagramElement {
  return {
    id,
    type: "edge",
    label,
    style: { edgeStyle: "orthogonalEdgeStyle", rounded: "1" },
    parent: "1",
    source,
    target,
  };
}

async function createDiagram(filePath: string, elements: DiagramElement[]): Promise<void> {
  const diagram: Diagram = {
    pages: [{ id: "page-1", name: "Page-1", elements }],
  };
  await writeDiagram(filePath, diagram);
}

describe("remove_elements", () => {
  it("removes a vertex from the diagram", async () => {
    const client = await setupClient();
    const filePath = tmpFile();
    cleanupFiles.push(filePath);
    await createDiagram(filePath, [
      makeVertex("v1", "A"),
      makeVertex("v2", "B"),
    ]);

    const result = await client.callTool({
      name: "remove_elements",
      arguments: { filePath, pageIndex: 0, ids: ["v1"] },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(content[0].text);
    expect(parsed.removed).toContain("v1");

    const diagram = await readDiagram(filePath);
    const ids = diagram.pages[0].elements.map((el) => el.id);
    expect(ids).not.toContain("v1");
    expect(ids).toContain("v2");
  });

  it("cascade-deletes edges connected to a removed vertex", async () => {
    const client = await setupClient();
    const filePath = tmpFile();
    cleanupFiles.push(filePath);
    await createDiagram(filePath, [
      makeVertex("v1", "A"),
      makeVertex("v2", "B"),
      makeVertex("v3", "C"),
      makeEdge("e1", "v1", "v2"),
      makeEdge("e2", "v2", "v3"),
    ]);

    const result = await client.callTool({
      name: "remove_elements",
      arguments: { filePath, pageIndex: 0, ids: ["v2"] },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(content[0].text);
    // v2 plus both edges that reference v2 should be removed
    expect(parsed.removed).toContain("v2");
    expect(parsed.removed).toContain("e1");
    expect(parsed.removed).toContain("e2");
    expect(parsed.removed).toHaveLength(3);

    const diagram = await readDiagram(filePath);
    const ids = diagram.pages[0].elements.map((el) => el.id);
    expect(ids).toEqual(["v1", "v3"]);
  });

  it("removes an edge without removing source or target vertices", async () => {
    const client = await setupClient();
    const filePath = tmpFile();
    cleanupFiles.push(filePath);
    await createDiagram(filePath, [
      makeVertex("v1", "A"),
      makeVertex("v2", "B"),
      makeEdge("e1", "v1", "v2"),
    ]);

    const result = await client.callTool({
      name: "remove_elements",
      arguments: { filePath, pageIndex: 0, ids: ["e1"] },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(content[0].text);
    expect(parsed.removed).toEqual(["e1"]);

    const diagram = await readDiagram(filePath);
    const ids = diagram.pages[0].elements.map((el) => el.id);
    expect(ids).toContain("v1");
    expect(ids).toContain("v2");
    expect(ids).not.toContain("e1");
  });

  it("handles non-existent IDs without error", async () => {
    const client = await setupClient();
    const filePath = tmpFile();
    cleanupFiles.push(filePath);
    await createDiagram(filePath, [
      makeVertex("v1", "A"),
      makeVertex("v2", "B"),
    ]);

    const result = await client.callTool({
      name: "remove_elements",
      arguments: { filePath, pageIndex: 0, ids: ["nonexistent"] },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(content[0].text);
    expect(parsed.removed).toEqual([]);
    expect(parsed.notFound).toContain("nonexistent");

    // Original elements should be unchanged
    const diagram = await readDiagram(filePath);
    expect(diagram.pages[0].elements).toHaveLength(2);
  });

  it("removes multiple elements in one call", async () => {
    const client = await setupClient();
    const filePath = tmpFile();
    cleanupFiles.push(filePath);
    await createDiagram(filePath, [
      makeVertex("v1", "A"),
      makeVertex("v2", "B"),
      makeVertex("v3", "C"),
      makeEdge("e1", "v1", "v2"),
    ]);

    const result = await client.callTool({
      name: "remove_elements",
      arguments: { filePath, pageIndex: 0, ids: ["v1", "v3"] },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(content[0].text);
    // v1, v3, and e1 (cascade from v1) should all be removed
    expect(parsed.removed).toContain("v1");
    expect(parsed.removed).toContain("v3");
    expect(parsed.removed).toContain("e1");

    const diagram = await readDiagram(filePath);
    const ids = diagram.pages[0].elements.map((el) => el.id);
    expect(ids).toEqual(["v2"]);
  });
});
