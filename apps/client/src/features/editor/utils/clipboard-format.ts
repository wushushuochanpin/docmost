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

const TABLE_DELIMITER_CELL_RE = /^:?-+:?$/;

function isTableDelimiterRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  const cells = trimmed.split("|").map((cell) => cell.trim());
  if (cells.length < 2) return false;
  let hasDash = false;
  for (const cell of cells) {
    if (cell === "") continue;
    if (!TABLE_DELIMITER_CELL_RE.test(cell)) return false;
    hasDash = true;
  }
  return hasDash;
}

function isTableRowLine(line: string): boolean {
  return /^\s*\|/.test(line);
}

// A pipe-separated line that does NOT start with a leading pipe — typically
// the second physical line of a multi-line cell emitted by Gemini/ChatGPT.
function isContinuationLine(line: string): boolean {
  const t = line.trim();
  if (t === "") return false;
  if (isTableRowLine(line)) return false;
  if (/^```|^~~~/.test(t)) return false;
  return t.includes("|");
}

function splitTableRow(line: string): string[] {
  return line.split("|").map((c) => c.trim());
}

function formatRow(cells: string[]): string {
  // cells includes the leading and trailing "" from split("|")
  return "| " + cells.slice(1, -1).join(" | ") + " |";
}

// Gemini / ChatGPT paste payloads produce *loose* and *multi-line-cell*
// tables that CommonMark/marked cannot parse:
//  - blank lines inside the table (after the delimiter or between rows) make
//    marked terminate the table early, dropping body rows into paragraphs;
//  - cells that span multiple physical lines are emitted as pipe-separated
//    continuation lines WITHOUT a leading pipe, which marked also treats as
//    paragraphs.
// This pre-processor recognizes a table block (header + delimiter), collects
// its body rows and continuation lines, merges continuation cells back into
// the preceding row, drops internal blank lines, and re-emits a tight GFM
// table that marked parses as a single structure.
export function repairMarkdownTables(value: string): string {
  const lines = value.split("\n");
  const out: string[] = [];
  let fenceChar: "`" | "~" | null = null;

  const nextNonBlankIdx = (from: number): number => {
    for (let j = from; j < lines.length; j++) {
      if (lines[j].trim() !== "") return j;
    }
    return -1;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);

    if (fenceMatch) {
      out.push(line);
      fenceChar = fenceChar ? null : (fenceMatch[1][0] as "`" | "~");
      i++;
      continue;
    }
    if (fenceChar) {
      out.push(line);
      i++;
      continue;
    }

    // Table start: a row line immediately followed by a delimiter row.
    if (isTableRowLine(line) && i + 1 < lines.length && isTableDelimiterRow(lines[i + 1])) {
      out.push(line); // header
      out.push(lines[i + 1]); // delimiter
      i += 2;

      let currentRow: string[] | null = null;

      while (i < lines.length) {
        const l = lines[i];
        const fm = l.match(/^ {0,3}(`{3,}|~{3,})/);
        if (fm) break;

        if (l.trim() === "") {
          const nx = nextNonBlankIdx(i + 1);
          if (nx === -1) break;
          const next = lines[nx];
          if (isTableRowLine(next) || isContinuationLine(next)) {
            i++; // drop internal blank
            continue;
          }
          break;
        }

        if (isTableRowLine(l)) {
          currentRow = splitTableRow(l);
          out.push(l);
        } else if (isContinuationLine(l) && currentRow) {
          const cont = splitTableRow(l);
          const N = currentRow.length;
          const K = cont.length;
          // Align continuation cells to the last K slots of the current row.
          for (let k = 0; k < K; k++) {
            const idx = N - K + k;
            if (idx >= 1 && idx < N - 1 && cont[k] !== "") {
              currentRow[idx] = currentRow[idx] + "<br>" + cont[k];
            }
          }
          out[out.length - 1] = formatRow(currentRow);
        } else {
          break;
        }
        i++;
      }
      continue;
    }

    out.push(line);
    i++;
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
