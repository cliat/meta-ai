export function formatOutput(value: unknown, json: boolean): string {
  if (json) {
    return JSON.stringify(value, null, 2);
  }

  if (typeof value === "string") {
    return value;
  }

  const record = asRecord(value);
  if (record) {
    return formatHumanReadableRecord(record);
  }

  return String(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}

function formatHumanReadableRecord(record: Record<string, unknown>): string {
  const command = typeof record.command === "string" ? record.command : null;
  const message = typeof record.message === "string" ? record.message : null;

  switch (command) {
    case "auth login":
      return [
        message,
        valueLine("Session", record.sessionPath),
        valueLine("Cookies", record.cookieCount),
        "Next: run authenticated commands with the same session file or let the default session path be reused automatically.",
      ].filter(Boolean).join("\n");
    case "image create":
      return [
        message,
        valueLine("Conversation", record.conversationId),
        ...formatSavedEntries("Image", record.images, ["path", "id"]),
        ...formatAnimationEntries(record.animation),
      ].filter(Boolean).join("\n");
    case "video create":
      return [
        message,
        valueLine("Conversation", record.conversationId),
        ...formatSavedEntries("Video", record.videos, ["path", "id"]),
      ].filter(Boolean).join("\n");
    case "history download":
      return [
        message,
        valueLine("Output", record.out),
        valueLine("Create IDs", Array.isArray(record.createIds) ? record.createIds.join(", ") : null),
        ...formatSavedEntries("File", record.files, ["path", "promptId", "mediaId"]),
        formatRemovedPromptIds(record.deletedPromptIds),
      ].filter(Boolean).join("\n");
    case "history clear":
      return [
        message,
        formatRemovedPromptIds(record.removedPromptIds),
      ].filter(Boolean).join("\n");
    default:
      return message ?? String(record);
  }
}

function formatSavedEntries(
  label: string,
  value: unknown,
  fields: string[],
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry, index) => {
    const record = asRecord(entry);
    if (!record) {
      return `${label} ${index + 1}`;
    }

    const details = fields
      .map((field) => valueLine(field, record[field]))
      .filter(Boolean)
      .join(" | ");
    return `${label} ${index + 1}: ${details}`.trim();
  });
}

function formatAnimationEntries(value: unknown): string[] {
  const record = asRecord(value);
  const videos = record?.videos;
  if (!Array.isArray(videos)) {
    return [];
  }

  return videos.map((entry, index) => {
    const animation = asRecord(entry);
    const finalVideo = asRecord(animation?.finalVideo);
    const path = finalVideo?.path;
    const id = finalVideo?.id;
    const prompt = animation?.prompt;
    return `Animation ${index + 1}: ${
      [valueLine("path", path), valueLine("id", id), valueLine("prompt", prompt)]
        .filter(Boolean)
        .join(" | ")
    }`;
  });
}

function formatRemovedPromptIds(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  return `Removed prompt IDs: ${value.join(", ")}`;
}

function valueLine(label: string, value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return `${label}: ${String(value)}`;
}
