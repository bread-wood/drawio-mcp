import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createServer } from "../server.js";
import { writeDiagram } from "../xml/parser.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Diagram } from "../model/diagram.js";

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

function callGetDiagram(client: Client, args: Record<string, unknown>) {
  return client.callTool({ name: "get_diagram", arguments: args });
}

function parseResponse(result: Awaited<ReturnType<Client["callTool"]>>) {
  const content = result.content as Array<{ type: string; text: string }>;
  return JSON.parse(content[0].text);
}

describe("get_diagram", () => {
  it("returns full diagram structure with elements", async () => {
    const filePath = tmpFile();
    cleanupFiles.push(filePath);

    const diagram: Diagram = {
      pages: [
        {
          id: "p1",
          name: "Main",
          elements: [
            {
              id: "v1",
              type: "vertex",
              label: "Box A",
              style: { rounded: "1", whiteSpace: "wrap", html: "1" },
              parent: "1",
              geometry: { x: 100, y: 50, width: 120, height: 60 },
            },
            {
              id: "v2",
              type: "vertex",
              label: "Box B",
              style: { shape: "ellipse", html: "1" },
              parent: "1",
              geometry: { x: 300, y: 200, width: 80, height: 80 },
            },
            {
              id: "e1",
              type: "edge",
              label: "link",
              style: { edgeStyle: "orthogonalEdgeStyle" },
              parent: "1",
              source: "v1",
              target: "v2",
            },
          ],
        },
      ],
    };

    await writeDiagram(filePath, diagram);
    const client = await setupClient();
    const result = await callGetDiagram(client, { filePath });

    expect(result.isError).toBeFalsy();
    const parsed = parseResponse(result);

    expect(parsed.totalPages).toBe(1);
    expect(parsed.pages).toHaveLength(1);

    const page = parsed.pages[0];
    expect(page.id).toBe("p1");
    expect(page.name).toBe("Main");
    expect(page.elementCount).toBe(3);

    // Check vertex
    const v1 = page.elements.find((e: Record<string, unknown>) => e.id === "v1");
    expect(v1).toBeDefined();
    expect(v1.type).toBe("vertex");
    expect(v1.label).toBe("Box A");
    expect(v1.style).toContain("rounded=1");
    expect(v1.geometry).toEqual({ x: 100, y: 50, width: 120, height: 60 });

    // Check edge
    const e1 = page.elements.find((e: Record<string, unknown>) => e.id === "e1");
    expect(e1).toBeDefined();
    expect(e1.type).toBe("edge");
    expect(e1.label).toBe("link");
    expect(e1.source).toBe("v1");
    expect(e1.target).toBe("v2");
  });

  it("returns a specific page by index", async () => {
    const filePath = tmpFile();
    cleanupFiles.push(filePath);

    const diagram: Diagram = {
      pages: [
        { id: "p1", name: "First", elements: [] },
        {
          id: "p2",
          name: "Second",
          elements: [
            {
              id: "v1",
              type: "vertex",
              label: "Only on page 2",
              style: { html: "1" },
              parent: "1",
              geometry: { x: 0, y: 0, width: 100, height: 50 },
            },
          ],
        },
        { id: "p3", name: "Third", elements: [] },
      ],
    };

    await writeDiagram(filePath, diagram);
    const client = await setupClient();
    const result = await callGetDiagram(client, { filePath, pageIndex: 1 });

    expect(result.isError).toBeFalsy();
    const parsed = parseResponse(result);

    expect(parsed.totalPages).toBe(3);
    // Single page mode returns "page" not "pages"
    expect(parsed.page).toBeDefined();
    expect(parsed.pages).toBeUndefined();

    expect(parsed.page.id).toBe("p2");
    expect(parsed.page.name).toBe("Second");
    expect(parsed.page.elementCount).toBe(1);
    expect(parsed.page.elements[0].label).toBe("Only on page 2");
  });

  it("returns error for non-existent file", async () => {
    const client = await setupClient();
    const result = await callGetDiagram(client, { filePath: "/nonexistent/path.drawio" });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toMatch(/Error:/);
  });

  it("returns error for invalid page index", async () => {
    const filePath = tmpFile();
    cleanupFiles.push(filePath);

    const diagram: Diagram = {
      pages: [{ id: "p1", name: "Only Page", elements: [] }],
    };

    await writeDiagram(filePath, diagram);
    const client = await setupClient();
    const result = await callGetDiagram(client, { filePath, pageIndex: 5 });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toMatch(/pageIndex 5 out of range/);
    expect(content[0].text).toMatch(/1 page/);
  });

  it("handles empty pages", async () => {
    const filePath = tmpFile();
    cleanupFiles.push(filePath);

    const diagram: Diagram = {
      pages: [{ id: "p1", name: "Empty", elements: [] }],
    };

    await writeDiagram(filePath, diagram);
    const client = await setupClient();
    const result = await callGetDiagram(client, { filePath });

    expect(result.isError).toBeFalsy();
    const parsed = parseResponse(result);

    expect(parsed.totalPages).toBe(1);
    expect(parsed.pages[0].elementCount).toBe(0);
    expect(parsed.pages[0].elements).toHaveLength(0);
  });
});
