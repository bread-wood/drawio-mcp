import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createServer } from "../server.js";
import { readDiagram } from "../xml/parser.js";
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

describe("create_diagram", () => {
  it("creates a file and reads it back with correct page count", async () => {
    const client = await setupClient();
    const filePath = tmpFile();
    cleanupFiles.push(filePath);

    const result = await client.callTool({
      name: "create_diagram",
      arguments: { filePath },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("Created");
    expect(content[0].text).toContain("1 page(s)");
    expect(result.isError).toBeFalsy();

    const diagram = await readDiagram(filePath);
    expect(diagram.pages).toHaveLength(1);
    expect(diagram.pages[0].name).toBe("Page-1");
    expect(diagram.pages[0].elements).toHaveLength(0);
  });

  it("creates with multiple page names and verifies all pages", async () => {
    const client = await setupClient();
    const filePath = tmpFile();
    cleanupFiles.push(filePath);

    const result = await client.callTool({
      name: "create_diagram",
      arguments: { filePath, pages: ["Overview", "Details", "Summary"] },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("3 page(s)");
    expect(result.isError).toBeFalsy();

    const diagram = await readDiagram(filePath);
    expect(diagram.pages).toHaveLength(3);
    expect(diagram.pages[0].name).toBe("Overview");
    expect(diagram.pages[0].id).toBe("page-1");
    expect(diagram.pages[1].name).toBe("Details");
    expect(diagram.pages[1].id).toBe("page-2");
    expect(diagram.pages[2].name).toBe("Summary");
    expect(diagram.pages[2].id).toBe("page-3");
  });

  it("returns error when file already exists", async () => {
    const client = await setupClient();
    const filePath = tmpFile();
    cleanupFiles.push(filePath);

    // Create the file first
    await writeFile(filePath, "existing content", "utf8");

    const result = await client.callTool({
      name: "create_diagram",
      arguments: { filePath },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(result.isError).toBe(true);
    expect(content[0].text).toContain("already exists");
  });

  it("defaults to single Page-1 when pages not provided", async () => {
    const client = await setupClient();
    const filePath = tmpFile();
    cleanupFiles.push(filePath);

    const result = await client.callTool({
      name: "create_diagram",
      arguments: { filePath },
    });

    expect(result.isError).toBeFalsy();

    const diagram = await readDiagram(filePath);
    expect(diagram.pages).toHaveLength(1);
    expect(diagram.pages[0].name).toBe("Page-1");
    expect(diagram.pages[0].id).toBe("page-1");
  });
});
