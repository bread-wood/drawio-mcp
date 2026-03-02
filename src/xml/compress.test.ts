import { describe, it, expect } from "vitest";
import { compressDiagramContent, decompressDiagramContent } from "./compress.js";

describe("compress", () => {
  it("round-trips compress -> decompress", () => {
    const original = "<mxGraphModel><root><mxCell id=\"0\"/></root></mxGraphModel>";
    const compressed = compressDiagramContent(original);
    const decompressed = decompressDiagramContent(compressed);
    expect(decompressed).toBe(original);
  });

  it("round-trips content with special characters", () => {
    const original = "<mxCell value=\"Hello &amp; World\" style=\"rounded=1;fillColor=#dae8fc;\"/>";
    const compressed = compressDiagramContent(original);
    const decompressed = decompressDiagramContent(compressed);
    expect(decompressed).toBe(original);
  });

  it("compressed output is a valid base64 string", () => {
    const xml = "<mxGraphModel><root></root></mxGraphModel>";
    const compressed = compressDiagramContent(xml);
    // base64 characters only
    expect(compressed).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it("decompresses known compressed content", () => {
    // Create a known compressed value from a known input
    const knownXml = "<mxGraphModel><root><mxCell id=\"0\"/><mxCell id=\"1\" parent=\"0\"/></root></mxGraphModel>";
    const encoded = compressDiagramContent(knownXml);
    // Verify we can decompress it back
    const result = decompressDiagramContent(encoded);
    expect(result).toBe(knownXml);
    expect(result).toContain("<mxGraphModel>");
    expect(result).toContain("<mxCell id=\"0\"/>");
  });
});
