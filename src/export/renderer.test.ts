import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExecFileException } from "node:child_process";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  access: vi.fn(),
}));

import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { shellExport } from "./renderer.js";

type ExecFileCallback = (
  error: ExecFileException | null,
  stdout: string,
  stderr: string,
) => void;

function mockExecFile(
  handler: (cmd: string, args: string[], cb: ExecFileCallback) => void,
): void {
  vi.mocked(execFile).mockImplementation(
    ((
      cmd: string,
      args: string[],
      cb: ExecFileCallback,
    ) => {
      handler(cmd, args, cb);
    }) as typeof execFile,
  );
}

function setupExecFileSuccess(): void {
  mockExecFile((_cmd, _args, cb) => {
    cb(null, "", "");
  });
}

function setupAccessFound(): void {
  vi.mocked(access).mockResolvedValue(undefined);
}

function setupAccessNotFound(): void {
  vi.mocked(access).mockRejectedValue(new Error("ENOENT"));
}

describe("shellExport", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("builds correct command with required args (macOS CLI)", async () => {
    setupAccessFound();
    setupExecFileSuccess();

    const result = await shellExport({
      filePath: "/tmp/test.drawio",
      format: "png",
    });

    expect(result).toBe("/tmp/test.png");

    expect(execFile).toHaveBeenCalledOnce();
    const [cmd, args] = vi.mocked(execFile).mock.calls[0] as [string, string[], ExecFileCallback];
    expect(cmd).toBe("/Applications/draw.io.app/Contents/MacOS/draw.io");
    expect(args).toEqual([
      "--export",
      "--format",
      "png",
      "--output",
      "/tmp/test.png",
      "/tmp/test.drawio",
    ]);
  });

  it("builds correct command with all optional args", async () => {
    setupAccessFound();
    setupExecFileSuccess();

    const result = await shellExport({
      filePath: "/home/user/diagram.drawio",
      format: "svg",
      outputPath: "/home/user/output.svg",
      pageIndex: 2,
      scale: 1.5,
    });

    expect(result).toBe("/home/user/output.svg");

    const [, args] = vi.mocked(execFile).mock.calls[0] as [string, string[], ExecFileCallback];
    expect(args).toEqual([
      "--export",
      "--format",
      "svg",
      "--output",
      "/home/user/output.svg",
      "--page-index",
      "2",
      "--scale",
      "1.5",
      "/home/user/diagram.drawio",
    ]);
  });

  it("generates default output path with correct extension", async () => {
    setupAccessFound();
    setupExecFileSuccess();

    const result = await shellExport({
      filePath: "/docs/arch.drawio",
      format: "svg",
    });

    expect(result).toBe("/docs/arch.svg");
  });

  it("uses custom outputPath when provided", async () => {
    setupAccessFound();
    setupExecFileSuccess();

    const result = await shellExport({
      filePath: "/tmp/test.drawio",
      format: "png",
      outputPath: "/custom/path/output.png",
    });

    expect(result).toBe("/custom/path/output.png");
  });

  it("falls back to which drawio when macOS path not found", async () => {
    setupAccessNotFound();

    mockExecFile((cmd, _args, cb) => {
      if (cmd === "which") {
        cb(null, "/usr/bin/drawio\n", "");
      } else {
        cb(null, "", "");
      }
    });

    await shellExport({
      filePath: "/tmp/test.drawio",
      format: "png",
    });

    // First call is `which drawio`, second is the actual export
    expect(execFile).toHaveBeenCalledTimes(2);
    const [exportCmd] = vi.mocked(execFile).mock.calls[1] as [string, string[], ExecFileCallback];
    expect(exportCmd).toBe("/usr/bin/drawio");
  });

  it("throws when CLI is not found anywhere", async () => {
    setupAccessNotFound();

    mockExecFile((_cmd, _args, cb) => {
      cb(new Error("not found") as ExecFileException, "", "");
    });

    await expect(
      shellExport({
        filePath: "/tmp/test.drawio",
        format: "png",
      }),
    ).rejects.toThrow("draw.io CLI not found");
  });

  it("propagates CLI execution errors", async () => {
    setupAccessFound();

    mockExecFile((_cmd, _args, cb) => {
      cb(new Error("Export failed: file not found") as ExecFileException, "", "");
    });

    await expect(
      shellExport({
        filePath: "/tmp/nonexistent.drawio",
        format: "png",
      }),
    ).rejects.toThrow("Export failed");
  });
});
