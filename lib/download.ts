import { ensureParentDir, resolvePath } from "./paths.ts";

export type DownloadResult = {
  path: string;
  bytes: number;
  contentType: string | null;
};

export async function downloadFile(
  url: string,
  outputPath: string,
  headers?: HeadersInit,
): Promise<DownloadResult> {
  const resolvedPath = await ensureParentDir(outputPath);
  const response = await fetch(url, { headers });

  if (!response.ok) {
    const text = await safeResponseText(response);
    throw new Error(
      `Download failed: ${response.status} ${response.statusText}${
        text ? `\n${text}` : ""
      }`,
    );
  }

  if (!response.body) {
    throw new Error(`Download response for ${url} did not include a body.`);
  }

  const file = await Deno.open(resolvedPath, {
    write: true,
    create: true,
    truncate: true,
  });

  await response.body.pipeTo(file.writable);

  const stat = await Deno.stat(resolvedPath);
  return {
    path: resolvePath(resolvedPath),
    bytes: stat.size,
    contentType: response.headers.get("content-type"),
  };
}

async function safeResponseText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 400);
  } catch {
    return "";
  }
}
