import { describe, it, expect } from "vitest";
import { createServer } from "../server.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const EXPECTED_PRESETS = [
  "rectangle",
  "rounded_rectangle",
  "ellipse",
  "diamond",
  "cylinder",
  "cloud",
  "document",
  "parallelogram",
  "hexagon",
  "triangle",
  "process",
  "callout",
  "actor",
  "database",
] as const;

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

describe("list_styles", () => {
  it("returns all 14 presets", async () => {
    const client = await setupClient();
    const result = await client.callTool({ name: "list_styles", arguments: {} });

    expect(result.content).toHaveLength(1);

    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].type).toBe("text");

    const parsed = JSON.parse(content[0].text) as Record<
      string,
      { style: string; description: string }
    >;
    const names = Object.keys(parsed);

    expect(names).toHaveLength(14);
    for (const preset of EXPECTED_PRESETS) {
      expect(names).toContain(preset);
    }
  });

  it("each preset has a style string and description", async () => {
    const client = await setupClient();
    const result = await client.callTool({ name: "list_styles", arguments: {} });

    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text) as Record<
      string,
      { style: string; description: string }
    >;

    for (const [name, entry] of Object.entries(parsed)) {
      expect(entry.style, `${name} should have a style string`).toBeTruthy();
      expect(entry.style, `${name} style should end with semicolon`).toMatch(/;$/);
      expect(entry.description, `${name} should have a description`).toBeTruthy();
    }
  });
});
