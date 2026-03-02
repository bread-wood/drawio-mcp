import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createServer } from "../server.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

function tmpFile(): string {
  return join(tmpdir(), `drawio-integration-${randomUUID()}.drawio`);
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
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);
  return client;
}

type TextContent = { type: string; text: string };

function parseText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as TextContent[];
  return content[0].text;
}

function parseJson(
  result: Awaited<ReturnType<Client["callTool"]>>,
): Record<string, unknown> {
  return JSON.parse(parseText(result)) as Record<string, unknown>;
}

describe("integration: create -> add_elements -> get_diagram", () => {
  it("creates a diagram, adds shapes, and reads back correct structure", async () => {
    const client = await setupClient();
    const filePath = tmpFile();
    cleanupFiles.push(filePath);

    // Step 1: Create diagram
    const createResult = await client.callTool({
      name: "create_diagram",
      arguments: { filePath, pages: ["Main"] },
    });
    expect(createResult.isError).toBeFalsy();
    expect(parseText(createResult)).toContain("Created");

    // Step 2: Add elements
    const addResult = await client.callTool({
      name: "add_elements",
      arguments: {
        filePath,
        pageIndex: 0,
        elements: [
          { id: "box-1", label: "Start", x: 0, y: 0, width: 120, height: 60 },
          {
            id: "box-2",
            label: "End",
            x: 200,
            y: 0,
            width: 120,
            height: 60,
          },
        ],
      },
    });
    expect(addResult.isError).toBeFalsy();
    const addParsed = parseJson(addResult);
    expect(addParsed.created).toEqual(["box-1", "box-2"]);

    // Step 3: Get diagram and verify
    const getResult = await client.callTool({
      name: "get_diagram",
      arguments: { filePath, pageIndex: 0 },
    });
    expect(getResult.isError).toBeFalsy();

    const diagram = parseJson(getResult) as {
      totalPages: number;
      page: {
        id: string;
        name: string;
        elementCount: number;
        elements: Array<{
          id: string;
          type: string;
          label: string;
          geometry: { x: number; y: number; width: number; height: number };
        }>;
      };
    };

    expect(diagram.totalPages).toBe(1);
    expect(diagram.page.name).toBe("Main");
    expect(diagram.page.elementCount).toBe(2);

    const el1 = diagram.page.elements.find((e) => e.id === "box-1");
    const el2 = diagram.page.elements.find((e) => e.id === "box-2");

    expect(el1).toBeDefined();
    expect(el1!.label).toBe("Start");
    expect(el1!.type).toBe("vertex");
    expect(el1!.geometry).toEqual({ x: 0, y: 0, width: 120, height: 60 });

    expect(el2).toBeDefined();
    expect(el2!.label).toBe("End");
    expect(el2!.type).toBe("vertex");
    expect(el2!.geometry).toEqual({ x: 200, y: 0, width: 120, height: 60 });
  });
});

describe("integration: create -> add_elements -> add_connections -> get_diagram", () => {
  it("creates vertices and connects them with edges, verifying edge endpoints", async () => {
    const client = await setupClient();
    const filePath = tmpFile();
    cleanupFiles.push(filePath);

    // Create diagram
    await client.callTool({
      name: "create_diagram",
      arguments: { filePath },
    });

    // Add three vertices
    const addResult = await client.callTool({
      name: "add_elements",
      arguments: {
        filePath,
        pageIndex: 0,
        elements: [
          { id: "v1", label: "A", x: 0, y: 0, width: 100, height: 50 },
          { id: "v2", label: "B", x: 200, y: 0, width: 100, height: 50 },
          { id: "v3", label: "C", x: 100, y: 150, width: 100, height: 50 },
        ],
      },
    });
    expect(addResult.isError).toBeFalsy();

    // Connect v1->v2 and v2->v3
    const connResult = await client.callTool({
      name: "add_connections",
      arguments: {
        filePath,
        pageIndex: 0,
        connections: [
          { id: "e1", label: "flow", source: "v1", target: "v2" },
          { id: "e2", label: "next", source: "v2", target: "v3" },
        ],
      },
    });
    expect(connResult.isError).toBeFalsy();
    const connParsed = parseJson(connResult);
    expect(connParsed.created).toEqual(["e1", "e2"]);

    // Get diagram and verify edges
    const getResult = await client.callTool({
      name: "get_diagram",
      arguments: { filePath, pageIndex: 0 },
    });
    expect(getResult.isError).toBeFalsy();

    const diagram = parseJson(getResult) as {
      page: {
        elementCount: number;
        elements: Array<{
          id: string;
          type: string;
          label: string;
          source?: string;
          target?: string;
        }>;
      };
    };

    // 3 vertices + 2 edges
    expect(diagram.page.elementCount).toBe(5);

    const edge1 = diagram.page.elements.find((e) => e.id === "e1");
    const edge2 = diagram.page.elements.find((e) => e.id === "e2");

    expect(edge1).toBeDefined();
    expect(edge1!.type).toBe("edge");
    expect(edge1!.label).toBe("flow");
    expect(edge1!.source).toBe("v1");
    expect(edge1!.target).toBe("v2");

    expect(edge2).toBeDefined();
    expect(edge2!.type).toBe("edge");
    expect(edge2!.label).toBe("next");
    expect(edge2!.source).toBe("v2");
    expect(edge2!.target).toBe("v3");
  });
});

describe("integration: create -> add_elements -> update_elements -> get_diagram", () => {
  it("adds shapes then updates their labels and styles", async () => {
    const client = await setupClient();
    const filePath = tmpFile();
    cleanupFiles.push(filePath);

    // Create diagram
    await client.callTool({
      name: "create_diagram",
      arguments: { filePath },
    });

    // Add elements
    await client.callTool({
      name: "add_elements",
      arguments: {
        filePath,
        pageIndex: 0,
        elements: [
          {
            id: "s1",
            label: "Original",
            style: { rounded: "0" },
            x: 10,
            y: 10,
            width: 100,
            height: 50,
          },
        ],
      },
    });

    // Update label and style
    const updateResult = await client.callTool({
      name: "update_elements",
      arguments: {
        filePath,
        pageIndex: 0,
        updates: [
          {
            id: "s1",
            label: "Updated",
            style: { fillColor: "#00FF00", rounded: "1" },
            x: 50,
            y: 100,
          },
        ],
      },
    });
    expect(updateResult.isError).toBeFalsy();
    const updateParsed = parseJson(updateResult);
    expect(updateParsed.updated).toBe(1);

    // Get diagram and verify
    const getResult = await client.callTool({
      name: "get_diagram",
      arguments: { filePath, pageIndex: 0 },
    });
    expect(getResult.isError).toBeFalsy();

    const diagram = parseJson(getResult) as {
      page: {
        elements: Array<{
          id: string;
          label: string;
          style: string;
          geometry: { x: number; y: number; width: number; height: number };
        }>;
      };
    };

    const el = diagram.page.elements.find((e) => e.id === "s1");
    expect(el).toBeDefined();
    expect(el!.label).toBe("Updated");

    // Style is returned as a string from get_diagram (via buildStyle)
    expect(el!.style).toContain("fillColor=#00FF00");
    expect(el!.style).toContain("rounded=1");

    // Geometry should reflect the update
    expect(el!.geometry.x).toBe(50);
    expect(el!.geometry.y).toBe(100);
    // Width and height should remain unchanged
    expect(el!.geometry.width).toBe(100);
    expect(el!.geometry.height).toBe(50);
  });
});

describe("integration: create -> add_elements -> add_connections -> remove_elements -> get_diagram", () => {
  it("removes a vertex and cascades deletion of connected edges", async () => {
    const client = await setupClient();
    const filePath = tmpFile();
    cleanupFiles.push(filePath);

    // Create diagram
    await client.callTool({
      name: "create_diagram",
      arguments: { filePath },
    });

    // Add three vertices
    await client.callTool({
      name: "add_elements",
      arguments: {
        filePath,
        pageIndex: 0,
        elements: [
          { id: "n1", label: "Node 1", x: 0, y: 0, width: 100, height: 50 },
          {
            id: "n2",
            label: "Node 2",
            x: 200,
            y: 0,
            width: 100,
            height: 50,
          },
          {
            id: "n3",
            label: "Node 3",
            x: 400,
            y: 0,
            width: 100,
            height: 50,
          },
        ],
      },
    });

    // Connect n1->n2, n2->n3, n1->n3
    await client.callTool({
      name: "add_connections",
      arguments: {
        filePath,
        pageIndex: 0,
        connections: [
          { id: "edge-a", source: "n1", target: "n2" },
          { id: "edge-b", source: "n2", target: "n3" },
          { id: "edge-c", source: "n1", target: "n3" },
        ],
      },
    });

    // Remove n1 -- should cascade-remove edge-a (n1->n2) and edge-c (n1->n3)
    const removeResult = await client.callTool({
      name: "remove_elements",
      arguments: {
        filePath,
        pageIndex: 0,
        ids: ["n1"],
      },
    });
    expect(removeResult.isError).toBeFalsy();

    const removeParsed = parseJson(removeResult) as {
      removed: string[];
      notFound: string[];
    };
    // n1 was directly removed; edge-a and edge-c were cascade-removed
    expect(removeParsed.removed).toContain("n1");
    expect(removeParsed.removed).toContain("edge-a");
    expect(removeParsed.removed).toContain("edge-c");
    expect(removeParsed.removed).toHaveLength(3);
    expect(removeParsed.notFound).toHaveLength(0);

    // Get diagram and verify only n2, n3, edge-b remain
    const getResult = await client.callTool({
      name: "get_diagram",
      arguments: { filePath, pageIndex: 0 },
    });
    expect(getResult.isError).toBeFalsy();

    const diagram = parseJson(getResult) as {
      page: {
        elementCount: number;
        elements: Array<{
          id: string;
          type: string;
          source?: string;
          target?: string;
        }>;
      };
    };

    expect(diagram.page.elementCount).toBe(3);

    const ids = diagram.page.elements.map((e) => e.id);
    expect(ids).toContain("n2");
    expect(ids).toContain("n3");
    expect(ids).toContain("edge-b");
    expect(ids).not.toContain("n1");
    expect(ids).not.toContain("edge-a");
    expect(ids).not.toContain("edge-c");

    // Verify the surviving edge still links n2->n3
    const survivingEdge = diagram.page.elements.find(
      (e) => e.id === "edge-b",
    );
    expect(survivingEdge!.source).toBe("n2");
    expect(survivingEdge!.target).toBe("n3");
  });
});

describe("integration: create -> add_elements (preset) -> update_elements (style merge) -> get_diagram", () => {
  it("merges additional style props on top of a preset style", async () => {
    const client = await setupClient();
    const filePath = tmpFile();
    cleanupFiles.push(filePath);

    // Create diagram
    await client.callTool({
      name: "create_diagram",
      arguments: { filePath },
    });

    // Add element with a preset style
    const addResult = await client.callTool({
      name: "add_elements",
      arguments: {
        filePath,
        pageIndex: 0,
        elements: [
          {
            id: "preset-el",
            label: "Rounded Box",
            preset: "rounded_rectangle",
            x: 10,
            y: 10,
            width: 140,
            height: 70,
          },
        ],
      },
    });
    expect(addResult.isError).toBeFalsy();

    // Update with additional style properties (merge, not replace)
    const updateResult = await client.callTool({
      name: "update_elements",
      arguments: {
        filePath,
        pageIndex: 0,
        updates: [
          {
            id: "preset-el",
            style: { fillColor: "#336699", strokeColor: "#003366" },
          },
        ],
      },
    });
    expect(updateResult.isError).toBeFalsy();

    // Get diagram and verify the style has both original preset props and new ones
    const getResult = await client.callTool({
      name: "get_diagram",
      arguments: { filePath, pageIndex: 0 },
    });
    expect(getResult.isError).toBeFalsy();

    const diagram = parseJson(getResult) as {
      page: {
        elements: Array<{
          id: string;
          style: string;
        }>;
      };
    };

    const el = diagram.page.elements.find((e) => e.id === "preset-el");
    expect(el).toBeDefined();

    const style = el!.style;

    // Original preset properties from rounded_rectangle should be preserved
    expect(style).toContain("rounded=1");
    expect(style).toContain("whiteSpace=wrap");
    expect(style).toContain("html=1");

    // New properties from the update should be present
    expect(style).toContain("fillColor=#336699");
    expect(style).toContain("strokeColor=#003366");
  });
});
