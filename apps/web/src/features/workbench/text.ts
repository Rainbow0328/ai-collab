export function extractReadableText(value: unknown, depth = 0): string {
  if (value === null || value === undefined || depth > 4) return "";

  if (typeof value === "string") {
    const trimmed = value.trim();
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        return extractReadableText(JSON.parse(trimmed), depth + 1);
      } catch {
        return value;
      }
    }
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => extractReadableText(item, depth + 1)).filter(Boolean).join("\n");
  }

  if (typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  const preferred = ["content", "message", "result", "summary", "description", "text", "reason", "error", "title"];
  for (const key of preferred) {
    const text = extractReadableText(record[key], depth + 1).trim();
    if (text) return text;
  }

  return Object.entries(record)
    .filter(([key]) => !["id", "kind", "role", "source", "agentId", "sessionId", "createdAt", "updatedAt"].includes(key))
    .map(([, item]) => extractReadableText(item, depth + 1))
    .filter(Boolean)
    .join("\n");
}

export function formatMessageText(value: unknown): string {
  return extractReadableText(value)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/([。！？!?])\s*(?=[^\n])/g, "$1\n")
    .replace(/(\d+[.)、])\s*/g, "\n$1 ")
    .trim();
}

export function formatJson(value: unknown): string {
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value, null, 2);
}

export function truncateText(value: string, max = 360): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}
