import { ensureParentDir, resolvePath } from "./paths.ts";

export const DEFAULT_META_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

export type BrowserCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
};

export type BrowserOrigin = {
  origin: string;
  localStorage?: Array<{ name: string; value: string }>;
};

export type StorageState = {
  cookies: BrowserCookie[];
  origins?: BrowserOrigin[];
};

export async function loadStorageState(
  sessionPath: string,
): Promise<{ path: string; state: StorageState }> {
  const resolvedPath = resolvePath(sessionPath);
  let raw: string;

  try {
    raw = await Deno.readTextFile(resolvedPath);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(
        `Session file not found at ${resolvedPath}. Run "login --session-path ${resolvedPath}" first or pass an existing session file.`,
      );
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Session file at ${resolvedPath} is not valid JSON: ${String(error)}`,
    );
  }

  if (!isStorageState(parsed)) {
    throw new Error(
      `Session file at ${resolvedPath} is not a Playwright storage state.`,
    );
  }

  return { path: resolvedPath, state: parsed };
}

export async function saveStorageState(
  state: StorageState,
  sessionPath: string,
): Promise<string> {
  const resolvedPath = await ensureParentDir(sessionPath);
  await Deno.writeTextFile(resolvedPath, JSON.stringify(state, null, 2));
  return resolvedPath;
}

export function buildMetaCookieHeader(state: StorageState): string {
  const nowSeconds = Date.now() / 1000;

  const cookies = state.cookies.filter((cookie) => {
    if (!cookie.value) {
      return false;
    }

    if (!cookie.domain.includes("meta.ai")) {
      return false;
    }

    if (
      typeof cookie.expires === "number" &&
      cookie.expires > 0 &&
      cookie.expires <= nowSeconds
    ) {
      return false;
    }

    return true;
  });

  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

export function hasMetaSessionCookie(state: StorageState): boolean {
  return state.cookies.some((cookie) =>
    cookie.name === "ecto_1_sess" &&
    cookie.domain.includes("meta.ai") &&
    cookie.value.length > 0
  );
}

function isStorageState(value: unknown): value is StorageState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return Array.isArray(record.cookies);
}
