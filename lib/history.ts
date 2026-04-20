import { join } from "@std/path";
import { downloadFile } from "./download.ts";
import {
  buildMetaCookieHeader,
  DEFAULT_META_USER_AGENT,
  hasMetaSessionCookie,
  loadStorageState,
  type StorageState,
} from "./session.ts";

const META_REFERER = "https://meta.ai/";
const META_CREATE_URL = new URL("/create", META_REFERER).toString();
const META_GRAPHQL_URL = new URL("/api/graphql", META_REFERER).toString();

const DOC_MEDIA_LIBRARY_FEED = "b87b0b6ed5a4909f1429da32b899a8a7";
const DOC_DELETE_CONVERSATION = "ad35bda8475e29ba4264ef0d6cc0958a";

const HISTORY_PAGE_SIZE = 100;
const DELETE_SETTLE_MS = 400;
const PROMPT_RESOLVE_SCAN_LIMIT_BYTES = 1_500_000;
const PROMPT_RESOLVE_KEEP_TAIL_BYTES = 120_000;

const PROMPT_ID_PATTERN = /\/prompt\/([0-9a-f-]{36})/i;

type HistoryFetchAuth = {
  cookieHeader: string;
  userAgent: string;
};

type FeedMediaItem = {
  id: string;
  url: string | null;
  promptId: string | null;
};

type FeedHistoryItem = {
  conversationId: string | null;
  promptId: string | null;
  media: FeedMediaItem[];
};

export type HistoryInventoryEntry = {
  promptId: string;
  createIds: string[];
  mediaUrls: string[];
};

export type DownloadedHistoryFile = {
  promptId: string;
  createIds: string[];
  kind: "image" | "video";
  url: string;
  path: string;
  bytes: number;
  contentType: string | null;
};

export async function collectHistoryInventory(
  sessionPath: string,
): Promise<{
  entries: HistoryInventoryEntry[];
  promptIds: string[];
  createIds: string[];
}> {
  const auth = await loadHistoryFetchAuth(sessionPath);
  const items = await fetchAllMediaLibraryItems(auth);
  await resolveFeedPromptIds(items, auth);

  const entriesByPromptId = new Map<string, {
    promptId: string;
    createIds: Set<string>;
    mediaUrls: Map<string, string>;
  }>();

  for (const item of items) {
    if (!item.promptId) {
      continue;
    }

    let entry = entriesByPromptId.get(item.promptId);
    if (!entry) {
      entry = {
        promptId: item.promptId,
        createIds: new Set<string>(),
        mediaUrls: new Map<string, string>(),
      };
      entriesByPromptId.set(item.promptId, entry);
    }

    for (const media of item.media) {
      entry.createIds.add(media.id);
      if (media.url) {
        const mediaKey = toMediaKey(media.url);
        const existing = entry.mediaUrls.get(mediaKey);
        if (!existing || media.url.length > existing.length) {
          entry.mediaUrls.set(mediaKey, media.url);
        }
      }
    }
  }

  const entries = [...entriesByPromptId.values()]
    .map((entry) => ({
      promptId: entry.promptId,
      createIds: [...entry.createIds].sort(),
      mediaUrls: [...entry.mediaUrls.values()],
    }))
    .filter((entry) => entry.mediaUrls.length > 0)
    .sort((left, right) => left.promptId.localeCompare(right.promptId));

  return {
    entries,
    promptIds: entries.map((entry) => entry.promptId),
    createIds: [...new Set(entries.flatMap((entry) => entry.createIds))].sort(),
  };
}

export async function downloadHistoryInventory(
  entries: HistoryInventoryEntry[],
  outDir: string,
  mediaDownloadHeaders: HeadersInit,
): Promise<DownloadedHistoryFile[]> {
  await Deno.mkdir(outDir, { recursive: true });
  const files: DownloadedHistoryFile[] = [];
  const seenUrls = new Set<string>();
  const perPromptCounters = new Map<string, { image: number; video: number }>();

  for (const entry of entries) {
    const counters = perPromptCounters.get(entry.promptId) ?? {
      image: 0,
      video: 0,
    };

    for (const url of entry.mediaUrls) {
      if (seenUrls.has(url)) {
        continue;
      }
      seenUrls.add(url);

      const kind = inferMediaKind(url);
      counters[kind] += 1;
      const extension = inferFileExtension(url, kind);
      const filePath = join(
        outDir,
        `${kind}-${entry.promptId}-${
          String(counters[kind]).padStart(2, "0")
        }${extension}`,
      );

      const download = await downloadFile(url, filePath, mediaDownloadHeaders);
      files.push({
        promptId: entry.promptId,
        createIds: entry.createIds,
        kind,
        url,
        path: download.path,
        bytes: download.bytes,
        contentType: download.contentType,
      });
    }

    perPromptCounters.set(entry.promptId, counters);
  }

  return files;
}

export async function clearHistoryContent(
  sessionPath: string,
  promptIds?: string[],
): Promise<{ removedPromptIds: string[] }> {
  const targetPromptIds = promptIds
    ? [...new Set(promptIds.filter((promptId) => promptId.length > 0))].sort()
    : null;
  if (targetPromptIds && targetPromptIds.length === 0) {
    return { removedPromptIds: [] };
  }

  const auth = await loadHistoryFetchAuth(sessionPath);
  const resolvedPromptIds = targetPromptIds ??
    await collectAllHistoryPromptIds(auth);

  const removedPromptIds: string[] = [];
  for (const promptId of resolvedPromptIds) {
    await deleteHistoryPrompt(promptId, auth);
    removedPromptIds.push(promptId);
    await delay(DELETE_SETTLE_MS);
  }

  return { removedPromptIds };
}

async function collectAllHistoryPromptIds(
  auth: HistoryFetchAuth,
): Promise<string[]> {
  const items = await fetchAllMediaLibraryItems(auth);
  await resolveFeedPromptIds(items, auth);
  return [...new Set(
    items.flatMap((item) => item.promptId ? [item.promptId] : []),
  )].sort();
}

async function loadHistoryFetchAuth(
  sessionPath: string,
): Promise<HistoryFetchAuth> {
  const { state } = await loadStorageState(sessionPath);
  return createHistoryFetchAuth(state);
}

function createHistoryFetchAuth(state: StorageState): HistoryFetchAuth {
  if (!hasMetaSessionCookie(state)) {
    throw new Error(
      'The session file does not contain a usable Meta session cookie. Run "login" again.',
    );
  }

  const cookieHeader = buildMetaCookieHeader(state);
  if (!cookieHeader) {
    throw new Error(
      'The session file does not include Meta cookies. Run "login" again.',
    );
  }

  return {
    cookieHeader,
    userAgent: DEFAULT_META_USER_AGENT,
  };
}

async function fetchAllMediaLibraryItems(
  auth: HistoryFetchAuth,
): Promise<FeedHistoryItem[]> {
  const items: FeedHistoryItem[] = [];
  let after: string | null = null;
  const seenCursors = new Set<string>();

  while (true) {
    if (after && seenCursors.has(after)) {
      throw new Error("Meta history feed repeated its pagination cursor.");
    }
    if (after) {
      seenCursors.add(after);
    }

    const page = await fetchMediaLibraryPage(after, auth);
    items.push(...page.items);

    if (!page.hasNextPage || !page.endCursor) {
      break;
    }
    after = page.endCursor;
  }

  return items;
}

async function fetchMediaLibraryPage(
  after: string | null,
  auth: HistoryFetchAuth,
): Promise<{
  items: FeedHistoryItem[];
  endCursor: string | null;
  hasNextPage: boolean;
}> {
  const response = await fetch(META_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Accept": "multipart/mixed, application/json",
      "Content-Type": "application/json",
      "Cookie": auth.cookieHeader,
      "Origin": "https://meta.ai",
      "Referer": META_CREATE_URL,
      "User-Agent": auth.userAgent,
    },
    body: JSON.stringify({
      doc_id: DOC_MEDIA_LIBRARY_FEED,
      variables: {
        after,
        filters: null,
        first: HISTORY_PAGE_SIZE,
        searchQuery: null,
      },
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Meta history feed request failed with status ${response.status}.\n${
        text.slice(0, 600)
      }`,
    );
  }

  const parsed = safeJsonParse(text);
  const topLevelError = firstErrorMessage(parsed);
  if (topLevelError) {
    throw new Error(`Meta history feed request failed: ${topLevelError}`);
  }

  const feed = getMediaLibraryFeedPayload(parsed);
  if (!feed) {
    throw new Error("Meta history feed returned an unexpected response.");
  }

  const edges = Array.isArray(feed.edges) ? feed.edges : [];
  const items = edges.map(coerceFeedHistoryItem).filter((item) =>
    item.media.length > 0
  );

  const pageInfo = asRecord(feed.pageInfo);
  return {
    items,
    endCursor: asOptionalString(pageInfo?.endCursor),
    hasNextPage: asOptionalBoolean(pageInfo?.hasNextPage) ?? false,
  };
}

function coerceFeedHistoryItem(value: unknown): FeedHistoryItem {
  const edge = asRecord(value);
  const node = asRecord(edge?.node);
  const images = coerceFeedMediaItems(node?.images, "image");
  const videos = coerceFeedMediaItems(node?.videos, "video");
  const media = [...images, ...videos];

  let promptId = media.find((item) => item.promptId)?.promptId ?? null;
  const conversationId = asOptionalString(node?.conversationId);

  if (!promptId && conversationId) {
    promptId = null;
  }

  return {
    conversationId,
    promptId,
    media,
  };
}

function coerceFeedMediaItems(
  value: unknown,
  kind: "image" | "video",
): FeedMediaItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: FeedMediaItem[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    const id = asOptionalString(record?.id);
    if (!id) {
      continue;
    }

    items.push({
      id,
      url: normalizeMediaUrl(asOptionalString(record?.url)),
      promptId: asOptionalString(record?.externalConversationId),
    });
  }

  return items;
}

async function resolveFeedPromptIds(
  items: FeedHistoryItem[],
  auth: HistoryFetchAuth,
): Promise<void> {
  const promptIdByConversationId = new Map<string, string>();
  const promptIdByCreateId = new Map<string, string>();

  for (const item of items) {
    if (!item.promptId) {
      continue;
    }

    if (item.conversationId) {
      promptIdByConversationId.set(item.conversationId, item.promptId);
    }
    for (const media of item.media) {
      promptIdByCreateId.set(media.id, item.promptId);
    }
  }

  for (const item of items) {
    if (item.promptId) {
      continue;
    }

    if (item.conversationId) {
      const cached = promptIdByConversationId.get(item.conversationId);
      if (cached) {
        item.promptId = cached;
      }
    }

    if (!item.promptId) {
      for (const media of item.media) {
        const cached = promptIdByCreateId.get(media.id);
        if (cached) {
          item.promptId = cached;
          break;
        }
      }
    }

    if (!item.promptId) {
      const media = item.media[0];
      if (!media) {
        continue;
      }
      item.promptId = await resolvePromptIdForCreateId(media.id, auth);
    }

    if (!item.promptId) {
      const mediaId = item.media[0]?.id ?? "unknown";
      throw new Error(`Could not resolve the prompt id for media ${mediaId}.`);
    }

    if (item.conversationId) {
      promptIdByConversationId.set(item.conversationId, item.promptId);
    }
    for (const media of item.media) {
      promptIdByCreateId.set(media.id, item.promptId);
    }
  }
}

async function resolvePromptIdForCreateId(
  createId: string,
  auth: HistoryFetchAuth,
): Promise<string> {
  const response = await fetch(new URL(`/create/${createId}`, META_REFERER), {
    headers: {
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Cookie": auth.cookieHeader,
      "Referer": META_CREATE_URL,
      "User-Agent": auth.userAgent,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Meta create page request failed with status ${response.status} for media ${createId}.\n${
        text.slice(0, 600)
      }`,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    const match = text.match(PROMPT_ID_PATTERN);
    if (match) {
      return match[1];
    }
    throw new Error(`Could not resolve the prompt id for media ${createId}.`);
  }

  const decoder = new TextDecoder();
  let text = "";
  let scannedBytes = 0;

  while (scannedBytes < PROMPT_RESOLVE_SCAN_LIMIT_BYTES) {
    const { value, done } = await reader.read();
    if (done || !value) {
      break;
    }

    scannedBytes += value.byteLength;
    text += decoder.decode(value, { stream: true });

    const match = text.match(PROMPT_ID_PATTERN);
    if (match) {
      await reader.cancel().catch(() => undefined);
      return match[1];
    }

    if (text.length > PROMPT_RESOLVE_KEEP_TAIL_BYTES * 2) {
      text = text.slice(-PROMPT_RESOLVE_KEEP_TAIL_BYTES);
    }
  }

  await reader.cancel().catch(() => undefined);
  throw new Error(`Could not resolve the prompt id for media ${createId}.`);
}

async function deleteHistoryPrompt(
  promptId: string,
  auth: HistoryFetchAuth,
): Promise<void> {
  const response = await fetch(META_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Accept": "multipart/mixed, application/json",
      "Content-Type": "application/json",
      "Cookie": auth.cookieHeader,
      "Origin": "https://meta.ai",
      "Referer": META_CREATE_URL,
      "User-Agent": auth.userAgent,
    },
    body: JSON.stringify({
      doc_id: DOC_DELETE_CONVERSATION,
      variables: {
        input: {
          id: promptId,
        },
      },
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Meta history delete failed with status ${response.status} for prompt ${promptId}.\n${
        text.slice(0, 600)
      }`,
    );
  }

  const parsed = safeJsonParse(text);
  const topLevelError = firstErrorMessage(parsed);
  if (topLevelError) {
    throw new Error(
      `Meta history delete failed for prompt ${promptId}: ${topLevelError}`,
    );
  }

  const deleteConversation = getDeleteConversationPayload(parsed);
  if (!deleteConversation) {
    throw new Error(
      `Meta history delete returned an unexpected response for prompt ${promptId}.`,
    );
  }

  if (
    deleteConversation.__typename === "GqlError" &&
    typeof deleteConversation.message === "string"
  ) {
    throw new Error(
      `Meta history delete failed for prompt ${promptId}: ${deleteConversation.message}`,
    );
  }
}

function getMediaLibraryFeedPayload(
  value: unknown,
): Record<string, unknown> | null {
  const data = asRecord(asRecord(value)?.data);
  const payload = asRecord(data?.mediaLibraryFeed);
  return payload ?? null;
}

function getDeleteConversationPayload(
  value: unknown,
): Record<string, unknown> | null {
  const data = asRecord(asRecord(value)?.data);
  const payload = asRecord(data?.deleteConversation);
  return payload ?? null;
}

function firstErrorMessage(value: unknown): string | null {
  const record = asRecord(value);
  const errors = record?.errors;
  if (!Array.isArray(errors)) {
    return null;
  }

  for (const error of errors) {
    const message = asOptionalString(asRecord(error)?.message);
    if (message) {
      return message;
    }
  }

  return null;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asOptionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function normalizeMediaUrl(url: string | null): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(
      url.replaceAll("&amp;", "&").replace(/\\u0026/g, "&"),
    );
    return parsed.toString();
  } catch {
    return url;
  }
}

function toMediaKey(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function inferMediaKind(url: string): "image" | "video" {
  const pathname = new URL(url).pathname.toLowerCase();
  return pathname.endsWith(".mp4") ? "video" : "image";
}

function inferFileExtension(
  url: string,
  kind: "image" | "video",
): string {
  const pathname = new URL(url).pathname.toLowerCase();
  const match = pathname.match(/\.(jpg|jpeg|png|webp|mp4)$/);
  if (match) {
    return `.${match[1]}`;
  }
  return kind === "video" ? ".mp4" : ".jpg";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
