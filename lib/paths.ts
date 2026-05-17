import { basename, dirname, extname, join, resolve } from "@std/path";

export const DEFAULT_SESSION_PATH = "~/.auth/cliat@meta-ai.json";

export function resolvePath(path: string): string {
  return resolve(expandHomeDirectory(path));
}

export async function ensureParentDir(filePath: string): Promise<string> {
  const resolved = resolvePath(filePath);
  await Deno.mkdir(dirname(resolved), { recursive: true });
  return resolved;
}

export async function planNumberedOutputs(
  outputPath: string,
  count: number,
  defaultExtension: string,
): Promise<string[]> {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("Output count must be a positive integer.");
  }

  const resolved = await ensureParentDir(outputPath);
  const extension = extname(resolved) || defaultExtension;
  const withoutExtension = extension && resolved.endsWith(extension)
    ? resolved.slice(0, -extension.length)
    : resolved;
  const parentDir = dirname(withoutExtension);
  const stem = basename(withoutExtension);
  const pattern = new RegExp(
    `^${escapeRegExp(stem)}-(\\d{4})${escapeRegExp(extension)}$`,
  );
  let maxIndex = 0;

  for await (const entry of Deno.readDir(parentDir)) {
    if (!entry.isFile) {
      continue;
    }

    const match = pattern.exec(entry.name);
    if (!match) {
      continue;
    }

    const current = Number.parseInt(match[1], 10);
    if (current > maxIndex) {
      maxIndex = current;
    }
  }

  return Array.from({ length: count }, (_, index) => {
    const suffix = String(maxIndex + index + 1).padStart(4, "0");
    return join(parentDir, `${stem}-${suffix}${extension}`);
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function expandHomeDirectory(path: string): string {
  if (path === "~") {
    return getHomeDirectory();
  }

  if (path.startsWith("~/") || path.startsWith("~\\")) {
    return join(getHomeDirectory(), path.slice(2));
  }

  return path;
}

function getHomeDirectory(): string {
  const home = Deno.build.os === "windows"
    ? Deno.env.get("USERPROFILE")
    : Deno.env.get("HOME");

  if (!home) {
    const variable = Deno.build.os === "windows" ? "USERPROFILE" : "HOME";
    throw new Error(
      `Could not resolve "~" because the ${variable} environment variable is not set.`,
    );
  }

  return home;
}
