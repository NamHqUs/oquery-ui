function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fieldLabel(path: string): string {
  return path
    .replace(/^\$\.?/, "")
    .replace(/Contexts\[(\d+)\]\.Value/gi, (_, index: string) => `Context ${Number(index) + 1}`)
    .replace(/Contexts\.([^.[]+)/gi, 'Context "$1"')
    .replace(/\./g, " > ") || "Request";
}

export function formatApiError(body: string, fallback: string): string {
  if (!body.trim()) return fallback;

  let problem: unknown;
  try {
    problem = JSON.parse(body);
  } catch {
    return /^\s*</.test(body) ? fallback : body.trim();
  }

  if (typeof problem === "string") return problem.trim() || fallback;
  if (!isRecord(problem)) return fallback;

  const validationMessages = isRecord(problem.errors)
    ? Object.entries(problem.errors).flatMap(([path, errors]) => {
      const messages = (Array.isArray(errors) ? errors : [errors])
        .filter((message): message is string => typeof message === "string" && Boolean(message.trim()));
      return [...new Set(messages)].map((message) => `- ${fieldLabel(path)}: ${message.trim()}`);
    })
    : [];
  const detail = typeof problem.detail === "string" ? problem.detail.trim() : "";
  const title = typeof problem.title === "string" ? problem.title.trim() : "";
  if (validationMessages.length) {
    return [
      "The query request contains invalid values. Correct the fields below and try again.",
      detail,
      ...validationMessages,
    ].filter(Boolean).join("\n");
  }
  return detail || title || fallback;
}
