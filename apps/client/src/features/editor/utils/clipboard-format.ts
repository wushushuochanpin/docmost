function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function trimOuterBlankLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;

  while (start < end && lines[start].trim() === "") {
    start += 1;
  }

  while (end > start && lines[end - 1].trim() === "") {
    end -= 1;
  }

  return lines.slice(start, end);
}

export function normalizePlainTextClipboard(value: string): string {
  const lines = trimOuterBlankLines(normalizeLineEndings(value).split("\n"));
  const normalized: string[] = [];
  let blankCount = 0;

  for (const line of lines) {
    if (line.trim() === "") {
      if (normalized.length > 0 && blankCount === 0) {
        normalized.push("");
      }
      blankCount += 1;
      continue;
    }

    normalized.push(line.replace(/[ \t]+$/g, ""));
    blankCount = 0;
  }

  return normalized.join("\n");
}

export function normalizeMarkdownClipboard(value: string): string {
  const lines = trimOuterBlankLines(normalizeLineEndings(value).split("\n"));
  const normalized: string[] = [];
  let blankCount = 0;
  let fenceChar: "`" | "~" | null = null;
  let fenceLength = 0;

  for (const line of lines) {
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);

    if (fenceMatch) {
      const fence = fenceMatch[1];
      normalized.push(line.replace(/[ \t]+$/g, ""));
      blankCount = 0;

      if (!fenceChar) {
        fenceChar = fence[0] as "`" | "~";
        fenceLength = fence.length;
      } else if (fence[0] === fenceChar && fence.length >= fenceLength) {
        fenceChar = null;
        fenceLength = 0;
      }

      continue;
    }

    if (fenceChar) {
      normalized.push(line);
      continue;
    }

    if (line.trim() === "") {
      if (normalized.length > 0 && blankCount === 0) {
        normalized.push("");
      }
      blankCount += 1;
      continue;
    }

    normalized.push(line.replace(/[ \t]+$/g, ""));
    blankCount = 0;
  }

  return normalized.join("\n");
}

const LIST_ITEM_RE = /^\s*(?:[-*+]|\d+[.)])\s+/;
const INDENTED_CONTINUATION_RE = /^\s+\S/;

// Gemini / ChatGPT paste payloads often put a blank line between ordered
// list items. CommonMark turns that into a *loose* list (every <li> wraps a
// <p>), which renders with a big extra gap between items. Drop blank lines
// that sit between consecutive list items so marked produces a tight list.
// Code-fence contents are preserved verbatim.
export function tightenListBlankLines(value: string): string {
  const lines = value.split("\n");
  const out: string[] = [];
  let fenceChar: "`" | "~" | null = null;

  const lastMeaningful = (): string | undefined => {
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i].trim() !== "") return out[i];
    }
    return undefined;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);

    if (fenceMatch) {
      out.push(line);
      fenceChar = fenceChar ? null : (fenceMatch[1][0] as "`" | "~");
      continue;
    }

    if (fenceChar) {
      out.push(line);
      continue;
    }

    if (line.trim() === "") {
      const next = lines[i + 1] || "";
      const prev = lastMeaningful();
      // Blank line between two list items (or between a list item and the
      // next item via a continuation line) → drop it to keep the list tight.
      if (
        LIST_ITEM_RE.test(next) &&
        prev !== undefined &&
        (LIST_ITEM_RE.test(prev) || INDENTED_CONTINUATION_RE.test(prev))
      ) {
        continue;
      }
    }

    out.push(line);
  }

  return out.join("\n");
}

function getFenceForContent(content: string): string {
  const longestBacktickRun = Math.max(
    0,
    ...Array.from(content.matchAll(/`+/g), (match) => match[0].length),
  );

  return "`".repeat(Math.max(3, longestBacktickRun + 1));
}

function sanitizeCodeFenceLanguage(language?: string | null): string {
  const normalized = language?.trim();

  if (!normalized) {
    return "";
  }

  return /^[A-Za-z0-9_+.#-]+$/.test(normalized) ? normalized : "";
}

export function formatCodeBlockAsMarkdown(
  content: string,
  language?: string | null,
): string {
  const body = normalizeLineEndings(content);
  const fence = getFenceForContent(body);
  const languageSuffix = sanitizeCodeFenceLanguage(language);
  const bodySeparator = body.length === 0 || body.endsWith("\n") ? "" : "\n";

  return `${fence}${languageSuffix}\n${body}${bodySeparator}${fence}`;
}
