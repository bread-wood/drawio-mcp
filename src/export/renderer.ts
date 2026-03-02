import { execFile as execFileCb } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";

const MACOS_CLI_PATH = "/Applications/draw.io.app/Contents/MacOS/draw.io";

export type ExportFormat = "png" | "svg";

interface ShellExportOptions {
  filePath: string;
  format: ExportFormat;
  outputPath?: string;
  pageIndex?: number;
  scale?: number;
}

function execFileAsync(
  cmd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFileCb(cmd, args, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

async function findCliPath(): Promise<string> {
  // Try macOS app bundle first
  try {
    await access(MACOS_CLI_PATH);
    return MACOS_CLI_PATH;
  } catch {
    // Not found at macOS path
  }

  // Try PATH lookup (Linux / manual install)
  try {
    const { stdout } = await execFileAsync("which", ["drawio"]);
    const resolved = stdout.trim();
    if (resolved) {
      return resolved;
    }
  } catch {
    // Not in PATH
  }

  throw new Error(
    "draw.io CLI not found. Install draw.io desktop app " +
      "(macOS: /Applications/draw.io.app, Linux: drawio in PATH).",
  );
}

function defaultOutputPath(filePath: string, format: ExportFormat): string {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, `${parsed.name}.${format}`);
}

export async function shellExport(options: ShellExportOptions): Promise<string> {
  const cliPath = await findCliPath();

  const outPath = options.outputPath ?? defaultOutputPath(options.filePath, options.format);

  const args = [
    "--export",
    "--format",
    options.format,
    "--output",
    outPath,
  ];

  if (options.pageIndex !== undefined) {
    args.push("--page-index", String(options.pageIndex));
  }

  if (options.scale !== undefined) {
    args.push("--scale", String(options.scale));
  }

  args.push(options.filePath);

  await execFileAsync(cliPath, args);

  return outPath;
}
