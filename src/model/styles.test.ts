import { describe, it, expect } from "vitest";
import { parseStyle, buildStyle, PRESETS } from "./styles.js";

describe("parseStyle", () => {
  it("parses semicolon-separated key=value pairs", () => {
    const result = parseStyle("rounded=1;fillColor=#fff;html=1;");
    expect(result).toEqual({
      rounded: "1",
      fillColor: "#fff",
      html: "1",
    });
  });

  it("handles empty string", () => {
    expect(parseStyle("")).toEqual({});
  });

  it("handles trailing semicolon", () => {
    const withTrailing = parseStyle("rounded=1;");
    const withoutTrailing = parseStyle("rounded=1");
    expect(withTrailing).toEqual(withoutTrailing);
  });

  it("handles bare prefix (no = sign)", () => {
    const result = parseStyle("text;whiteSpace=wrap;html=1;");
    expect(result).toEqual({
      "": "text",
      whiteSpace: "wrap",
      html: "1",
    });
  });

  it("handles values containing = sign", () => {
    const result = parseStyle("label=a=b;html=1;");
    expect(result).toEqual({
      label: "a=b",
      html: "1",
    });
  });
});

describe("buildStyle", () => {
  it("produces semicolon-separated string ending with semicolon", () => {
    const result = buildStyle({ rounded: "1", html: "1" });
    expect(result).toBe("rounded=1;html=1;");
  });

  it("output ends with semicolon", () => {
    const result = buildStyle({ shape: "ellipse" });
    expect(result.endsWith(";")).toBe(true);
  });

  it("handles empty record", () => {
    expect(buildStyle({})).toBe("");
  });

  it("handles bare prefix stored under empty key", () => {
    const result = buildStyle({ "": "text", whiteSpace: "wrap" });
    expect(result).toBe("text;whiteSpace=wrap;");
  });
});

describe("parseStyle/buildStyle round-trip", () => {
  it("round-trips a standard style string", () => {
    const original = "rounded=1;whiteSpace=wrap;html=1;";
    const parsed = parseStyle(original);
    const rebuilt = buildStyle(parsed);
    expect(rebuilt).toBe(original);
  });

  it("round-trips a style with bare prefix", () => {
    const original = "text;whiteSpace=wrap;html=1;";
    const parsed = parseStyle(original);
    const rebuilt = buildStyle(parsed);
    expect(rebuilt).toBe(original);
  });

  it("round-trips all PRESETS", () => {
    for (const [name, preset] of Object.entries(PRESETS)) {
      const rebuilt = buildStyle(preset);
      const reparsed = parseStyle(rebuilt);
      expect(reparsed, `preset "${name}" should round-trip`).toEqual(preset);
    }
  });
});

describe("PRESETS", () => {
  it("contains all expected preset names", () => {
    const expected = [
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
    ];
    expect(Object.keys(PRESETS).sort()).toEqual(expected.sort());
  });

  it("all presets produce valid style strings via buildStyle", () => {
    for (const [name, preset] of Object.entries(PRESETS)) {
      const style = buildStyle(preset);
      expect(style.length, `preset "${name}" should produce non-empty style`).toBeGreaterThan(0);
      expect(style.endsWith(";"), `preset "${name}" style should end with semicolon`).toBe(true);
      // Every segment should be key=value
      const segments = style.split(";").filter((s) => s.length > 0);
      for (const segment of segments) {
        expect(segment.includes("="), `segment "${segment}" in preset "${name}" should contain =`).toBe(true);
      }
    }
  });

  it("all presets include html=1", () => {
    for (const [name, preset] of Object.entries(PRESETS)) {
      expect(preset.html, `preset "${name}" should have html=1`).toBe("1");
    }
  });
});
