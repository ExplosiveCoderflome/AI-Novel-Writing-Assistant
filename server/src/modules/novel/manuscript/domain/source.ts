import { createHash, randomUUID } from "node:crypto";
import type { ManuscriptEncoding, ManuscriptPartitionUnit, ManuscriptRange } from "@ai-novel/shared";

export const MAX_RAW_BYTES = 20 * 1024 * 1024;
export const MAX_SOURCE_UNITS = 3_000_000;
export const MAX_BODY_UNITS = 3_000;

export function decodeManuscript(raw: Buffer, requested?: ManuscriptEncoding): { text: string; encoding: ManuscriptEncoding } {
  if (raw.byteLength > MAX_RAW_BYTES) throw new Error("MANUSCRIPT_SIZE_LIMIT");
  let encoding = requested;
  let bytes = raw;
  if (raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) { encoding = "utf-8"; bytes = raw.subarray(3); }
  else if (raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe) { encoding = "utf-16le"; bytes = raw.subarray(2); }
  else if (raw.length >= 2 && raw[0] === 0xfe && raw[1] === 0xff) { encoding = "utf-16be"; bytes = raw.subarray(2); }
  encoding ??= "utf-8";
  try {
    const text = new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(bytes);
    if (text.length > MAX_SOURCE_UNITS) throw new Error("MANUSCRIPT_CHARACTER_LIMIT");
    if (!text.trim()) throw new Error("MANUSCRIPT_EMPTY");
    return { text, encoding };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("MANUSCRIPT_")) throw error;
    throw new Error("ENCODING_CONFIRM_REQUIRED");
  }
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function validateManuscriptPartition(text: string, units: ManuscriptPartitionUnit[]): { coverageHash: string; bodyUnitCount: number; attachmentUnitCount: number; unresolvedCount: number } {
  if (text.length === 0 || units.length === 0) throw new Error("PARTITION_INCOMPLETE");
  const draftIds = new Set<string>();
  let cursor = 0;
  let bodyUnitCount = 0;
  let attachmentUnitCount = 0;
  let unresolvedCount = 0;
  for (const unit of units) {
    if (!unit || typeof unit !== "object" || !["body", "toc", "front_matter", "back_matter", "other_reviewed"].includes(unit.role)) throw new Error("PARTITION_INVALID_ROLE");
    if (typeof unit.draftId !== "string" || !unit.draftId.trim() || draftIds.has(unit.draftId)) throw new Error("PARTITION_DRAFT_ID_INVALID");
    draftIds.add(unit.draftId);
    if (typeof unit.title !== "string" || unit.title.length > 200 || typeof unit.needsReview !== "boolean") throw new Error("PARTITION_UNIT_INVALID");
    const { start, end } = unit.range;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start !== cursor || end <= start || end > text.length) throw new Error("PARTITION_INCOMPLETE");
    if (start > 0 && isLowSurrogate(text.charCodeAt(start)) && isHighSurrogate(text.charCodeAt(start - 1))) throw new Error("PARTITION_SURROGATE_SPLIT");
    if (end < text.length && isLowSurrogate(text.charCodeAt(end)) && isHighSurrogate(text.charCodeAt(end - 1))) throw new Error("PARTITION_SURROGATE_SPLIT");
    cursor = end;
    if (unit.role === "body") bodyUnitCount++;
    else attachmentUnitCount++;
    if (unit.needsReview) unresolvedCount++;
  }
  if (cursor !== text.length || bodyUnitCount === 0 || bodyUnitCount > MAX_BODY_UNITS) throw new Error("PARTITION_INCOMPLETE");
  const canonical = units.map(({ range, role, title, draftId }) => ({ range, role, title, draftId }));
  return { coverageHash: sha256(JSON.stringify(canonical)), bodyUnitCount, attachmentUnitCount, unresolvedCount };
}

function isLowSurrogate(code: number): boolean { return code >= 0xdc00 && code <= 0xdfff; }
function isHighSurrogate(code: number): boolean { return code >= 0xd800 && code <= 0xdbff; }

export function detectRulePartition(text: string): ManuscriptPartitionUnit[] {
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) lineStarts.push(i + 1);
  const headings: Array<{ start: number; title: string }> = [];
  const heading = /^\s*(第[零〇一二三四五六七八九十百千万\d]+[章节回卷部篇].{0,100}|(?:chapter|book|part)\s+[0-9ivxlcdm]+(?:[\s.:：—-].{0,100})?|序章|序言|前言|楔子|尾声|后记|番外(?:篇)?)(?:\s|$)/iu;
  for (let i = 0; i < lineStarts.length; i++) {
    const start = lineStarts[i]!;
    const end = i + 1 < lineStarts.length ? lineStarts[i + 1]! : text.length;
    const line = text.slice(start, end).replace(/[\r\n]+$/u, "");
    const match = heading.exec(line);
    if (match) headings.push({ start, title: match[1]!.trim() });
  }
  const tocLine = lineStarts.map((start, index) => {
    const end = lineStarts[index + 1] ?? text.length;
    return { start, line: text.slice(start, end).replace(/[\r\n]+$/u, "").trim() };
  }).find(item => /^(?:目录|目\s*次|contents)$/iu.test(item.line));
  if (tocLine && !headings.some(item => item.start === tocLine.start)) headings.push({ start: tocLine.start, title: "目录候选（请核对）" });
  headings.sort((a, b) => a.start - b.start);
  const boundaries = headings.length ? headings : [{ start: 0, title: "全文（章节边界待确认）" }];
  const units: ManuscriptPartitionUnit[] = [];
  const frontEnd = boundaries[0]!.start;
  if (frontEnd > 0) {
    const prefix = text.slice(0, frontEnd);
    const toc = /(?:目录|目\s*次|contents)/iu.test(prefix) && /(?:第[零〇一二三四五六七八九十百千万\d]+章|chapter\s+[0-9ivxlcdm]+)/iu.test(prefix);
    units.push({ draftId: randomUUID(), range: { start: 0, end: frontEnd }, role: toc ? "toc" : "front_matter", title: toc ? "目录候选（请核对）" : "前言及未分类内容", needsReview: true });
  }
  for (let i = 0; i < boundaries.length; i++) {
    const current = boundaries[i]!;
    const end = boundaries[i + 1]?.start ?? text.length;
    if (end <= current.start) continue;
    const backMatter = /^(后记)/u.test(current.title);
    let role: ManuscriptPartitionUnit["role"] = backMatter ? "back_matter" : "body";
    if (current.title === "目录候选（请核对）") role = "toc";
    units.push({ draftId: randomUUID(), range: { start: current.start, end }, role, title: current.title, confidence: headings.length ? 0.7 : 0.1, needsReview: true });
  }
  if (!units.length && text.length) units.push({ draftId: randomUUID(), range: { start: 0, end: text.length }, role: "body", title: "全文（章节边界待确认）", needsReview: true });
  return units;
}

/** Short-story boundaries are reviewable candidates, never a semantic decision. */
export function detectShortStoryPartition(text: string): ManuscriptPartitionUnit[] {
  const starts = [0];
  const separator = /\r?\n[ \t]*\r?\n[ \t]*/gu;
  for (const match of text.matchAll(separator)) {
    const start = (match.index ?? 0) + match[0].length;
    if (start < text.length && start > starts.at(-1)!) starts.push(start);
  }
  if (starts.length === 1) return [{draftId: randomUUID(), range: {start: 0, end: text.length}, role: "body", title: "全文（短篇分节待确认）", confidence: 0.2, needsReview: true}];
  return starts.map((start, index) => ({
    draftId: randomUUID(), range: {start, end: starts[index + 1] ?? text.length}, role: "body" as const,
    title: `分节候选 ${index + 1}`, confidence: 0.2, needsReview: true,
  }));
}

export type { ManuscriptRange };
