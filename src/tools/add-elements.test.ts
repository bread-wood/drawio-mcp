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

async function createEmptyDiagram(filePath: string): Promise<void> {
  const diagram: Diagram = {
    pages: [{ id: "page-1", name: "Page-1", elements: [] }],
  };
  await writeDiagram(filePath, diagram);
}

describe("add_elements", () => {
  it("adds a single element with correct label, position, and style", async () => {
    const client = await setupClient();
    const filePath = tmpFile();
    cleanupFiles.push(filePath);
    await createEmptyDiagram(filePath);

    const result = await client.callTool({
      name: "add_elements",
      arguments: {
        filePath,
        pageIndex: 0,
        elements: [
          {
            id: "my-shape",
            label: "Hello",
            style: { rounded: "1", whiteSpace: "wrap" },
            x: 100,
            y: 50,
            width: 200,
            height: 80,
          },
        ],
      },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(content[0].text);
    expect(parsed.created).toEqual(["my-shape"]);

    const diagram = await readDiagram(filePath);
    expect(diagram.pages[0].elements).toHaveLength(1);

    const el = diagram.pages[0].elements[0];
    expect(el.id).toBe("my-shape");
    expect(el.label).toBe("Hello");
    expect(el.type).toBe("vertex");
    expect(el.geometry).toEqual({ x: 100, y: 50, width: 200, height: 80 });
    expect(el.style["rounded"]).toBe("1");
    expect(el.style["whiteSpace"]).toBe("wrap");
  });

  it("adds a batch of elements with correct positions", async () => {
    const client = await setupClient();
    const filePath = tmpFile();
    cleanupFiles.push(filePath);
    await createEmptyDiagram(filePath);

    const result = await client.callTool({
      name: "add_elements",
      arguments: {
        filePath,
        pageIndex: 0,
        elements: [
          { id: "a", label: "A", x: 0, y: 0, width: 100, height: 50 },
          { id: "b", label: "B", x: 200, y: 0, width: 100, height: 50 },
          { id: "c", label: "C", x: 400, y: 0, width: 100, height: 50 },
        ],
      },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(content[0].text);
    expect(parsed.created).toEqual(["a", "b", "c"]);

    const diagram = await readDiagram(filePath);
    expect(diagram.pages[0].elements).toHaveLength(3);

    expect(diagram.pages[0].elements[0].id).toBe("a");
    expect(diagram.pages[0].elements[0].label).toBe("A");
    expect(diagram.pages[0].elements[0].geometry).toEqual({ x: 0, y: 0, width: 100, height: 50 });

    expect(diagram.pages[0].elements[1].id).toBe("b");
    expect(diagram.pages[0].elements[1].label).toBe("B");
    expect(diagram.pages[0].elements[1].geometry).toEqual({ x: 200, y: 0, width: 100, height: 50 });

    expect(diagram.pages[0].elements[2].id).toBe("c");
    expect(diagram.pages[0].elements[2].label).toBe("C");
    expect(diagram.pages[0].elements[2].geometry).toEqual({ x: 400, y: 0, width: 100, height: 50 });
  });

  it("merges preset style with custom overrides", async () => {
    const client = await setupClient();
    const filePath = tmpFile();
    cleanupFiles.push(filePath);
    await createEmptyDiagram(filePath);

    const result = await client.callTool({
      name: "add_elements",
      arguments: {
        filePath,
        pageIndex: 0,
        elements: [
          {
            id: "styled",
            label: "Styled",
            preset: "rounded_rectangle",
            style: { fillColor: "#FF0000", rounded: "0" },
            x: 10,
            y: 20,
            width: 150,
            height: 70,
          },
        ],
      },
    });

    expect(result.isError).toBeFalsy();

    const diagram = await readDiagram(filePath);
    const el = diagram.pages[0].elements[0];

    // Preset properties should be present
    expect(el.style["whiteSpace"]).toBe("wrap");
    expect(el.style["html"]).toBe("1");
    // Override should take precedence
    expect(el.style["rounded"]).toBe("0");
    // Custom property should be present
    expect(el.style["fillColor"]).toBe("#FF0000");
  });

  it("auto-generates numeric IDs starting from 2 on empty page", async () => {
    const client = await setupClient();
    const filePath = tmpFile();
    cleanupFiles.push(filePath);
    await createEmptyDiagram(filePath);

    const result = await client.callTool({
      name: "add_elements",
      arguments: {
        filePath,
        pageIndex: 0,
        elements: [
          { label: "First" },
          { label: "Second" },
        ],
      },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(content[0].text);
    expect(parsed.created).toEqual(["2", "3"]);

    const diagram = await readDiagram(filePath);
    expect(diagram.pages[0].elements).toHaveLength(2);
    expect(diagram.pages[0].elements[0].id).toBe("2");
    expect(diagram.pages[0].elements[0].label).toBe("First");
    expect(diagram.pages[0].elements[1].id).toBe("3");
    expect(diagram.pages[0].elements[1].label).toBe("Second");
  });

  it("returns error for invalid page index", async () => {
    const client = await setupClient();
    const filePath = tmpFile();
    cleanupFiles.push(filePath);
    await createEmptyDiagram(filePath);

    const result = await client.callTool({
      name: "add_elements",
      arguments: {
        filePath,
        pageIndex: 5,
        elements: [{ label: "Test" }],
      },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(result.isError).toBe(true);
    expect(content[0].text).toContain("page index 5 out of range");
  });
});
