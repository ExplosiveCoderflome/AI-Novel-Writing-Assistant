import { createHash } from "node:crypto";
import { normalizeChapterText } from "@ai-novel/shared/types/chapterEditor/document";
import { styleSignalPolicySchema, type StyleSignalPolicy, type StyleSignalFinding, type StyleSignalScan } from "@ai-novel/shared/types/styleEngine";

const characters = (text: string) => Array.from(text.replace(/\s/gu, "")).length;
function spans(text: string): Array<{ from: number; to: number }> {
  const result = [];
  let from = 0;
  // Paragraphs and Chinese/English terminal marks separate sentences; decimals
  // stay intact. Ellipses and closing quotation marks belong to their sentence.
  for (const mark of text.matchAll(/[。！？!?]+[”"’']*|\.{3,}[”"’']*|(?<!\d)\.(?!\d)[”"’']*|…+[”"’']*|\n/gu)) {
    const to = mark.index + mark[0].length;
    result.push({ from, to }); from = to;
  }
  if (from < text.length) result.push({ from, to: text.length });
  return result;
}
function positions(text: string, term: string): number[] {
  const found = [];
  let cursor = 0;
  while (cursor < text.length) {
    const at = text.indexOf(term, cursor);
    if (at < 0) break;
    found.push(at); cursor = at + term.length;
  }
  return found;
}

/** Pure evidence scan. Counts do not decide a violation, risk score or repair. */
export function scanStyleSignals(content: string, policy: StyleSignalPolicy): StyleSignalScan {
  const effective = styleSignalPolicySchema.parse(policy);
  const text = normalizeChapterText(content);
  const findings: StyleSignalFinding[] = [];
  const emit = (ruleId: StyleSignalFinding["ruleId"], from: number, to: number,
    matchedTerms: string[], hits: number, count: number, commas = 0, matchFrom?: number) => {
    if (findings.length >= effective.maxFindings || findings.filter(item => item.ruleId === ruleId).length >= effective.maxPerRule) return;
    // Do not split a supplementary Unicode character when producing the excerpt.
    if (from > 0 && /[\uDC00-\uDFFF]/u.test(text[from])) from--;
    const excerpt = Array.from(text.slice(from, to)).slice(0, effective.excerptCharacters).join("");
    if (!excerpt) return;
    findings.push({ ruleId, from, to: from + excerpt.length, excerpt, matchedTerms, hits, characters: count, commas,
      ...(matchFrom !== undefined ? { matchFrom } : {}) });
  };
  for (const term of new Set(effective.transitionTerms)) {
    const found = positions(text, term);
    if (found.length < effective.transitionRepeatCount) continue;
    for (const at of found.slice(1)) emit("template.transition", at,
      Math.min(text.length, at + term.length + 48), [term], found.length, characters(term), 0, at);
  }
  for (const span of spans(text)) {
    const sentence = text.slice(span.from, span.to);
    const count = characters(sentence);
    if (count < effective.minSentenceCharacters) continue;
    const commas = (sentence.match(/[,，]/gu) ?? []).length;
    if (count >= effective.longSentenceCharacters && commas >= effective.commaCount) {
      emit("rhythm.comma-density", span.from, span.to, [], commas, count, commas);
    }
    for (const [ruleId, terms] of [
      ["surface.repeated-softeners", effective.softenerTerms],
      ["surface.action-adverb-stack", effective.actionAdverbTerms],
    ] as const) {
      const matches = [...new Set(terms)].map(term => ({ term, count: positions(sentence, term).length })).filter(item => item.count > 0);
      const hits = matches.reduce((sum, item) => sum + item.count, 0);
      if (hits >= effective.clusterCount) emit(ruleId, span.from, span.to, matches.map(item => item.term), hits, count, commas);
    }
  }
  return { policy: effective, sourceContentHash: createHash("sha256").update(text).digest("hex"),
    coordinateSystem: "utf16-crlf-normalized", findings };
}
