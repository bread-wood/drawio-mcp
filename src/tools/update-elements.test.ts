import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createServer } from "../server.js";
import { readDiagram, writeDiagram } from "../xml/parser.js";
import type { Diagram } from "../model/diagram.js";
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

async function createDiagramWithElements(filePath: string): Promise<void> {
  const diagram: Diagram = {
    pages: [
      {
        id: "page-1",
        name: "Page-1",
        elements: [
          {
            id: "el-1",
            type: "vertex",
            label: "Box A",
            style: { rounded: "1", whiteSpace: "wrap", html: "1" },
            parent: "1",
            geometry: { x: 100, y: 50, width: 120, height: 60 },
          },
          {
            id: "el-2",
            type: "vertex",
            label: "Box B",
            style: { rounded: "0", fillColor: "#CCCCCC", html: "1" },
            parent: "1",
            geometry: { x: 300, y: 200, width: 150, height: 80 },
          },
        ],
      },
    ],
  };
  await writeDiagram(filePath, diagram);
}

describe("update_elements", () => {
  it("updates element label", async () => {
    const client = await setupClient();
    const filePath = tmpFile();
    cleanupFiles.push(filePath);
    await createDiagramWithElements(filePath);

    const result = await client.callTool({
      name: "update_elements",
      arguments: {
        filePath,
        pageIndex: 0,
        updates: [{ id: "el-1", label: "Updated Label" }],
      },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(content[0].text);
    expect(parsed.updated).toBe(1);

    const diagram = await readDiagram(filePath);
    const el = diagram.pages[0].elements.find((e) => e.id === "el-1");
    expect(el?.label).toBe("Updated Label");
  });

  it("merges style without overwriting unspecified properties", async () => {
    const client = await setupClient();
    const filePath = tmpFile();
    cleanupFiles.push(filePath);
    await createDiagramWithElements(filePath);

    const result = await client.callTool({
      name: "update_elements",
      arguments: {
        filePath,
        pageIndex: 0,
        updates: [{ id: "el-1", style: { fillColor: "#FF0000", rounded: "0" } }],
      },
    });

    expect(result.isError).toBeFalsy();

    const diagram = await readDiagram(filePath);
    const el = diagram.pages[0].elements.find((e) => e.id === "el-1");
    // New property added
    expect(el?.style["fillColor"]).toBe("#FF0000");
    // Overwritten property
    expect(el?.style["rounded"]).toBe("0");
    // Preserved properties
    expect(el?.style["whiteSpace"]).toBe("wrap");
    expect(el?.style["html"]).toBe("1");
  });

  it("updates geometry partially without changing other fields", async () => {
    const client = await setupClient();
    const filePath = tmpFile();
    cleanupFiles.push(filePath);
    await createDiagramWithElements(filePath);

    const result = await client.callTool({
      name: "update_elements",
      arguments: {
        filePath,
        pageIndex: 0,
        updates: [{ id: "el-1", x: 500 }],
      },
    });

    expect(result.isError).toBeFalsy();

    const diagram = await readDiagram(filePath);
    const el = diagram.pages[0].elements.find((e) => e.id === "el-1");
    expect(el?.geometry).toEqual({ x: 500, y: 50, width: 120, height: 60 });
  });

  it("returns error for non-existent element ID", async () => {
    const client = await setupClient();
    const filePath = tmpFile();
    cleanupFiles.push(filePath);
    await createDiagramWithElements(filePath);

    const result = await client.callTool({
      name: "update_elements",
      arguments: {
        filePath,
        pageIndex: 0,
        updates: [{ id: "nonexistent", label: "Nope" }],
      },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(result.isError).toBe(true);
    expect(content[0].text).toContain("nonexistent");
    expect(content[0].text).toContain("not found");
  });

  it("updates multiple elements in one call", async () => {
    const client = await setupClient();
    const filePath = tmpFile();
    cleanupFiles.push(filePath);
    await createDiagramWithElements(filePath);

    const result = await client.callTool({
      name: "update_elements",
      arguments: {
        filePath,
        pageIndex: 0,
        updates: [
          { id: "el-1", label: "New A", x: 0, y: 0 },
          { id: "el-2", label: "New B", width: 200 },
        ],
      },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(content[0].text);
    expect(parsed.updated).toBe(2);

    const diagram = await readDiagram(filePath);
    const el1 = diagram.pages[0].elements.find((e) => e.id === "el-1");
    const el2 = diagram.pages[0].elements.find((e) => e.id === "el-2");

    expect(el1?.label).toBe("New A");
    expect(el1?.geometry?.x).toBe(0);
    expect(el1?.geometry?.y).toBe(0);
    // width and height unchanged
    expect(el1?.geometry?.width).toBe(120);
    expect(el1?.geometry?.height).toBe(60);

    expect(el2?.label).toBe("New B");
    expect(el2?.geometry?.width).toBe(200);
    // Other geometry fields unchanged
    expect(el2?.geometry?.x).toBe(300);
    expect(el2?.geometry?.y).toBe(200);
    expect(el2?.geometry?.height).toBe(80);
  });
});
