import { inflateRawSync, deflateRawSync } from "node:zlib";

// Decompress diagram content: base64 decode -> inflateRaw -> URL decode
export function decompressDiagramContent(encoded: string): string {
  const buf = Buffer.from(encoded, "base64");
  const inflated = inflateRawSync(buf);
  return decodeURIComponent(inflated.toString("utf8"));
}

// Compress diagram content: URL encode -> deflateRaw -> base64
export function compressDiagramContent(xml: string): string {
  const urlEncoded = encodeURIComponent(xml);
  const deflated = deflateRawSync(Buffer.from(urlEncoded, "utf8"));
  return deflated.toString("base64");
}
