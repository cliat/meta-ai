export function formatOutput(value: unknown, json: boolean): string {
  if (json) {
    return JSON.stringify(value, null, 2);
  }

  if (typeof value === "string") {
    return value;
  }

  const record = asRecord(value);
  if (record && "message" in record) {
    const message = record.message;
    if (typeof message === "string") {
      return message;
    }
  }

  return String(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}
