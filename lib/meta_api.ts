import {
  buildMetaCookieHeader,
  DEFAULT_META_USER_AGENT,
  hasMetaSessionCookie,
  type StorageState,
} from "./session.ts";

const GRAPHQL_ENDPOINT = "https://meta.ai/api/graphql";
const META_REFERER = "https://meta.ai/";

const DOC_SEND_MESSAGE_STREAM = "aa858a331f5475c7ae2d75572b914fec";
const DOC_BATCHED_GENERATION_STATUS = "9928a9b87ec492a16326f18925191c0f";
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const POLL_JITTER_MS = 500;
const GRAPHQL_RATE_LIMIT_MAX_REQUESTS = 30;
const GRAPHQL_RATE_LIMIT_WINDOW_MS = 60_000;
const GRAPHQL_RETRY_ATTEMPTS = 3;
const GRAPHQL_RETRY_BASE_DELAY_MS = 2_000;

type MetaOperation =
  | "TEXT_TO_IMAGE"
  | "TEXT_TO_VIDEO"
  | "IMAGE_TO_VIDEO"
  | "EXTEND_VIDEO";

export type AspectRatio = "9:16" | "1:1" | "16:9";
type MetaOrientation = "VERTICAL" | "SQUARE" | "LANDSCAPE";

export type GeneratedImage = {
  id: string;
  url: string | null;
  thumbnail?: string | null;
  prompt?: string | null;
  downloadableFileName?: string | null;
  aspectRatio?: number | null;
  orientation?: string | null;
};

export type GeneratedVideo = {
  id: string;
  url: string | null;
  thumbnail?: string | null;
  prompt?: string | null;
  downloadableFileName?: string | null;
  width?: number | null;
  height?: number | null;
  aspectRatio?: number | null;
  orientation?: string | null;
  sourceMedia?: {
    id?: string;
    url?: string | null;
    thumbnail?: string | null;
  } | null;
};

export type CompletedVideo = GeneratedVideo & {
  url: string;
  status: string;
};

type AssistantMessage = {
  __typename: "AssistantMessage";
  id?: string;
  content?: string;
  conversationId: string;
  branchPath: string;
  streamingState?: string | null;
  error?: unknown;
  images?: GeneratedImage[];
  videos?: GeneratedVideo[];
};

type OperationDraftResult = {
  conversationId: string;
  branchPath: string;
  assistantMessageId?: string;
  content?: string;
  images: GeneratedImage[];
  videos: GeneratedVideo[];
};

type StatusRecord = {
  mediaId: string;
  status: string;
  generatedVideo: Record<string, unknown> | null;
};

export type MetaAiClientOptions = {
  userAgent?: string;
  timezone?: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
};

export class MetaAiClient {
  readonly timezone: string;
  readonly userAgent: string;
  readonly pollIntervalMs: number;
  readonly timeoutMs: number;

  private readonly cookieHeader: string;
  private readonly rateLimiter = new SlidingWindowRateLimiter(
    GRAPHQL_RATE_LIMIT_MAX_REQUESTS,
    GRAPHQL_RATE_LIMIT_WINDOW_MS,
  );

  constructor(
    private readonly storageState: StorageState,
    options: MetaAiClientOptions = {},
  ) {
    if (!hasMetaSessionCookie(storageState)) {
      throw new Error(
        'The session file does not contain a usable Meta session cookie. Run "login" again.',
      );
    }

    this.cookieHeader = buildMetaCookieHeader(storageState);
    if (!this.cookieHeader) {
      throw new Error(
        'The session file does not include Meta cookies. Run "login" again.',
      );
    }

    this.timezone = options.timezone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone ??
      "UTC";
    this.userAgent = options.userAgent ?? DEFAULT_META_USER_AGENT;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.timeoutMs = options.timeoutMs ?? 15 * 60 * 1000;
  }

  getMediaDownloadHeaders(): HeadersInit {
    return {
      "Referer": META_REFERER,
      "User-Agent": this.userAgent,
    };
  }

  async createImage(
    prompt: string,
    aspect: AspectRatio = "9:16",
    count = 4,
  ): Promise<OperationDraftResult> {
    if (!Number.isInteger(count) || count < 1) {
      throw new Error("Image count must be a positive integer.");
    }

    return await this.sendMessageOperation({
      conversationId: crypto.randomUUID(),
      currentBranchPath: "0",
      content: prompt,
      entryPoint: "KADABRA__UNKNOWN",
      imagineOperationRequest: {
        operation: "TEXT_TO_IMAGE",
        textToImageParams: {
          prompt,
          orientation: aspectToOrientation(aspect),
          numMedia: count,
        },
        requestId: crypto.randomUUID(),
      },
      isNewConversation: true,
    });
  }

  async createVideo(
    prompt: string,
    aspect?: AspectRatio,
  ): Promise<OperationDraftResult> {
    const textToImageParams: Record<string, unknown> = { prompt };
    if (aspect) {
      textToImageParams.orientation = aspectToOrientation(aspect);
    }

    return await this.sendMessageOperation({
      conversationId: crypto.randomUUID(),
      currentBranchPath: "0",
      content: `Animate ${prompt}`,
      entryPoint: "KADABRA__UNKNOWN",
      imagineOperationRequest: {
        operation: "TEXT_TO_VIDEO",
        textToImageParams,
        requestId: null,
      },
      isNewConversation: true,
    });
  }

  async animateImage(
    conversationId: string,
    branchPath: string,
    image: GeneratedImage,
    prompt: string,
  ): Promise<OperationDraftResult> {
    if (!image.url) {
      throw new Error("The selected image does not have a downloadable URL.");
    }

    return await this.sendMessageOperation({
      conversationId,
      currentBranchPath: branchPath,
      content: prompt,
      entryPoint: "KADABRA__IMAGINE_UNIFIED_CANVAS",
      imagineOperationRequest: {
        operation: "IMAGE_TO_VIDEO",
        imageToVideoParams: {
          sourceMediaEntId: image.id,
          sourceMediaUrl: image.url,
          prompt,
          numMedia: 1,
        },
        requestId: null,
      },
      isNewConversation: false,
    });
  }

  async extendVideo(
    conversationId: string,
    branchPath: string,
    video: CompletedVideo,
  ): Promise<OperationDraftResult> {
    return await this.sendMessageOperation({
      conversationId,
      currentBranchPath: branchPath,
      content: "Extend",
      entryPoint: "KADABRA__IMAGINE_UNIFIED_CANVAS",
      imagineOperationRequest: {
        operation: "EXTEND_VIDEO",
        extendVideoParams: {
          sourceMediaEntId: video.id,
          sourceMediaUrl: video.url,
          numMedia: 1,
        },
        requestId: null,
      },
      isNewConversation: false,
    });
  }

  async waitForVideos(
    videos: GeneratedVideo[],
    conversationId: string,
  ): Promise<CompletedVideo[]> {
    if (videos.length === 0) {
      throw new Error("No video variants were returned by Meta.");
    }

    const baseById = new Map(videos.map((video) => [video.id, video]));
    const pendingIds = new Set(videos.map((video) => video.id));
    const completed = new Map<string, CompletedVideo>();
    const deadline = Date.now() + this.timeoutMs;

    while (pendingIds.size > 0 && Date.now() < deadline) {
      const snapshot = await this.fetchBatchedStatus(
        [...pendingIds],
        conversationId,
      );

      for (const record of snapshot) {
        if (!pendingIds.has(record.mediaId)) {
          continue;
        }

        if (record.status === "FAILED") {
          throw new Error(`Meta failed to generate video ${record.mediaId}.`);
        }

        const generatedVideo = record.generatedVideo ?? {};
        const videoUrl = asOptionalString(generatedVideo.url);
        if (!videoUrl) {
          continue;
        }

        const base = baseById.get(record.mediaId) ?? { id: record.mediaId };
        completed.set(record.mediaId, {
          ...base,
          ...coerceGeneratedVideo(generatedVideo),
          id: record.mediaId,
          url: videoUrl,
          status: record.status,
        });
        pendingIds.delete(record.mediaId);
      }

      if (pendingIds.size > 0) {
        await delay(this.pollIntervalMs + randomInt(0, POLL_JITTER_MS));
      }
    }

    if (pendingIds.size > 0) {
      throw new Error(
        `Timed out waiting for Meta to finish videos: ${
          [...pendingIds].join(", ")
        }`,
      );
    }

    return videos.map((video) => {
      const completedVideo = completed.get(video.id);
      if (!completedVideo) {
        throw new Error(`Missing completed data for video ${video.id}.`);
      }
      return completedVideo;
    });
  }

  private async sendMessageOperation(input: {
    conversationId: string;
    currentBranchPath: string;
    content: string;
    entryPoint: string;
    imagineOperationRequest: Record<string, unknown>;
    isNewConversation: boolean;
  }): Promise<OperationDraftResult> {
    const userMessageId = crypto.randomUUID();
    const assistantMessageId = crypto.randomUUID();
    const turnId = crypto.randomUUID();
    const promptSessionId = crypto.randomUUID();

    const payload = {
      doc_id: DOC_SEND_MESSAGE_STREAM,
      variables: {
        conversationId: input.conversationId,
        content: input.content,
        userMessageId,
        assistantMessageId,
        userUniqueMessageId: makeNumericMessageId(),
        turnId,
        mode: "create",
        attachments: null,
        mentions: null,
        clippyIp: null,
        isNewConversation: input.isNewConversation,
        imagineOperationRequest: input.imagineOperationRequest,
        qplJoinId: null,
        clientTimezone: this.timezone,
        developerOverridesForMessage: null,
        clientLatitude: null,
        clientLongitude: null,
        devicePixelRatio: null,
        entryPoint: input.entryPoint,
        promptSessionId,
        promptType: null,
        conversationStarterId: null,
        userAgent: this.userAgent,
        currentBranchPath: input.currentBranchPath,
        promptEditType: "new_message",
        userLocale: "en-US",
        userEventId: null,
        requestedToolCall: null,
      },
    };

    const raw = await this.postGraphqlSse(payload);
    const assistant = getFinalAssistantMessage(raw);

    if (assistant.error) {
      throw new Error(
        `Meta returned an assistant error: ${JSON.stringify(assistant.error)}`,
      );
    }

    return {
      conversationId: assistant.conversationId,
      branchPath: assistant.branchPath,
      assistantMessageId: assistant.id,
      content: assistant.content,
      images: (assistant.images ?? []).filter((image) => !!image.id),
      videos: (assistant.videos ?? []).filter((video) => !!video.id),
    };
  }

  private async fetchBatchedStatus(
    mediaIds: string[],
    conversationId: string,
  ): Promise<StatusRecord[]> {
    const raw = await this.postGraphqlSse({
      doc_id: DOC_BATCHED_GENERATION_STATUS,
      variables: {
        mediaIds,
        conversationId,
      },
    });

    const events = parseSseEvents(raw);
    const latestById = new Map<string, StatusRecord>();

    for (const event of events) {
      if (event.event !== "next" || !event.data) {
        continue;
      }

      const payload = safeJsonParse(event.data);
      if (!payload) {
        continue;
      }

      for (const statusRecord of collectStatusRecords(payload)) {
        const previous = latestById.get(statusRecord.mediaId);
        if (!previous) {
          latestById.set(statusRecord.mediaId, statusRecord);
          continue;
        }

        const previousHasUrl = asOptionalString(previous.generatedVideo?.url);
        const currentHasUrl = asOptionalString(
          statusRecord.generatedVideo?.url,
        );
        if (!previousHasUrl && currentHasUrl) {
          latestById.set(statusRecord.mediaId, statusRecord);
          continue;
        }

        if (
          previous.status !== "COMPLETE" && statusRecord.status === "COMPLETE"
        ) {
          latestById.set(statusRecord.mediaId, statusRecord);
        }
      }
    }

    return [...latestById.values()];
  }

  private async postGraphqlSse(body: Record<string, unknown>): Promise<string> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < GRAPHQL_RETRY_ATTEMPTS; attempt += 1) {
      await this.rateLimiter.waitForSlot();

      const response = await fetch(GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: this.buildHeaders("text/event-stream"),
        body: JSON.stringify(body),
      });

      const text = await response.text();
      if (response.ok) {
        if (text.includes("<html") || text.includes("<!DOCTYPE html")) {
          throw new Error(
            'Meta returned HTML instead of API data. The saved session is likely expired; run "login" again.',
          );
        }

        return text;
      }

      lastError = new Error(
        `Meta API request failed: ${response.status} ${response.statusText}\n${
          text.slice(0, 600)
        }`,
      );

      if (
        !isRetriableStatus(response.status) ||
        attempt === GRAPHQL_RETRY_ATTEMPTS - 1
      ) {
        throw lastError;
      }

      const backoffMs = GRAPHQL_RETRY_BASE_DELAY_MS * (2 ** attempt) +
        randomInt(0, 500);
      await delay(backoffMs);
    }

    throw lastError ?? new Error("Meta API request failed.");
  }

  private buildHeaders(accept: string): HeadersInit {
    return {
      "Accept": accept,
      "Content-Type": "application/json",
      "Cookie": this.cookieHeader,
      "Origin": "https://meta.ai",
      "Referer": META_REFERER,
      "User-Agent": this.userAgent,
    };
  }
}

function coerceGeneratedVideo(
  value: Record<string, unknown>,
): Partial<GeneratedVideo> {
  return {
    thumbnail: asOptionalString(value.thumbnail),
    width: asOptionalNumber(value.width),
    height: asOptionalNumber(value.height),
    aspectRatio: asOptionalNumber(value.aspectRatio),
    orientation: asOptionalString(value.orientation),
  };
}

function collectStatusRecords(
  value: unknown,
  found: StatusRecord[] = [],
): StatusRecord[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectStatusRecords(item, found);
    }
    return found;
  }

  if (!value || typeof value !== "object") {
    return found;
  }

  const record = value as Record<string, unknown>;
  const mediaId = asOptionalString(record.mediaId);
  const status = asOptionalString(record.status);
  const generatedVideo = asOptionalRecord(record.generatedVideo);

  if (mediaId && (status || generatedVideo)) {
    found.push({
      mediaId,
      status: status ?? "UNKNOWN",
      generatedVideo,
    });
  }

  for (const child of Object.values(record)) {
    collectStatusRecords(child, found);
  }

  return found;
}

function getFinalAssistantMessage(rawSse: string): AssistantMessage {
  const events = parseSseEvents(rawSse);
  const assistantMessages: AssistantMessage[] = [];
  const graphqlErrors: string[] = [];

  for (const event of events) {
    if (event.event !== "next" || !event.data) {
      continue;
    }

    const payload = safeJsonParse(event.data);
    graphqlErrors.push(...collectGraphqlErrorMessages(payload));
    const message = asOptionalRecord(payload?.data)?.sendMessageStream;
    if (!message || typeof message !== "object") {
      continue;
    }

    const assistant = message as AssistantMessage;
    if (assistant.__typename === "AssistantMessage") {
      assistantMessages.push(assistant);
    }
  }

  const doneMessage = [...assistantMessages].reverse().find((message) =>
    message.streamingState === "DONE"
  );
  const finalMessage = doneMessage ?? assistantMessages.at(-1);
  if (!finalMessage) {
    if (graphqlErrors.length > 0) {
      throw new Error(
        `Meta API returned GraphQL errors: ${graphqlErrors.join("; ")}`,
      );
    }

    throw new Error("Meta did not return an assistant message.");
  }

  return finalMessage;
}

function collectGraphqlErrorMessages(
  payload: Record<string, unknown> | null,
): string[] {
  const errors = payload?.errors;
  if (!Array.isArray(errors)) {
    return [];
  }

  return errors.map((error) => {
    const record = asOptionalRecord(error);
    const message = asOptionalString(record?.message);
    const code = asOptionalString(asOptionalRecord(record?.extensions)?.code);
    return code ? `${message ?? "Unknown GraphQL error"} (${code})` : message;
  }).filter((message): message is string => !!message);
}

function parseSseEvents(raw: string): Array<{ event: string; data: string }> {
  const blocks = raw.replaceAll("\r\n", "\n").split("\n\n");
  const events: Array<{ event: string; data: string }> = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) {
      continue;
    }

    let eventName = "message";
    const dataLines: string[] = [];

    for (const line of block.split("\n")) {
      if (!line || line.startsWith(":")) {
        continue;
      }

      if (line.startsWith("event:")) {
        eventName = line.slice("event:".length).trim();
        continue;
      }

      if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trimStart());
      }
    }

    events.push({
      event: eventName,
      data: dataLines.join("\n"),
    });
  }

  return events;
}

function safeJsonParse(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asOptionalNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function asOptionalRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : null;
}

function makeNumericMessageId(): string {
  const timestamp = Date.now().toString();
  const random = crypto.getRandomValues(new Uint32Array(1))[0]
    .toString()
    .slice(0, 6)
    .padStart(6, "0");
  return `${timestamp}${random}`;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

class SlidingWindowRateLimiter {
  private readonly timestamps: number[] = [];
  private queue = Promise.resolve();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  async waitForSlot(): Promise<void> {
    const operation = this.queue.then(async () => {
      while (true) {
        const now = Date.now();
        this.prune(now);

        if (this.timestamps.length < this.maxRequests) {
          this.timestamps.push(now);
          return;
        }

        const waitMs = this.timestamps[0] + this.windowMs - now;
        await delay(Math.max(waitMs, 50));
      }
    });

    this.queue = operation.catch(() => {});
    await operation;
  }

  private prune(now: number): void {
    while (
      this.timestamps.length > 0 &&
      now - this.timestamps[0] >= this.windowMs
    ) {
      this.timestamps.shift();
    }
  }
}

function aspectToOrientation(aspect: AspectRatio): MetaOrientation {
  switch (aspect) {
    case "9:16":
      return "VERTICAL";
    case "1:1":
      return "SQUARE";
    case "16:9":
      return "LANDSCAPE";
  }
}
