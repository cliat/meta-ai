export function formatOutput(value: unknown, json: boolean): string {
  if (json) {
    return JSON.stringify(value, null, 2);
  }

  if (typeof value === "string") {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    "message" in (value as Record<string, unknown>)
  ) {
    const message = (value as Record<string, unknown>).message;
    if (typeof message === "string") {
      return message;
    }
  }

  return String(value);
}
