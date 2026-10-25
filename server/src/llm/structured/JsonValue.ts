/** Extract complete JSON without modifying strings or inventing missing content. */
export function stripOuterJsonFence(source: string): string {
  const text = source.trim();
  const match = /^```(?:json)?[ \t]*(?:\r?\n)?([\s\S]*?)\r?\n?```$/i.exec(text);
  return match ? match[1].trim() : text;
}

export function extractCompleteJsonValue(source: string): string {
  const text = stripOuterJsonFence(source);
  try { JSON.parse(text); return text; } catch { /* inspect complete outer candidates */ }
  const candidates: string[] = [];
  let incomplete = false;
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{" && text[start] !== "[") continue;
    const stack: string[] = [];
    let quoted = false;
    let escaped = false;
    let end = start;
    for (; end < text.length; end += 1) {
      const char = text[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') { quoted = true; continue; }
      if (char === "{" || char === "[") stack.push(char === "{" ? "}" : "]");
      else if (char === "}" || char === "]") {
        if (stack.pop() !== char) throw new Error("JSON 解析失败：括号顺序错误。");
        if (!stack.length) break;
      }
    }
    if (end >= text.length) { incomplete = true; break; }
    const candidate = text.slice(start, end + 1);
    try { JSON.parse(candidate); candidates.push(candidate); }
    catch {
      // A bracketed prose label may precede JSON. Never salvage nested values from a broken object.
      if (candidate.startsWith("{") || /["{}:]/.test(candidate)) {
        throw new Error("JSON 解析失败：完整结构中存在语法错误。");
      }
    }
    start = end;
  }
  if (incomplete) throw new Error("JSON 解析失败：未检测到完整 JSON 值。");
  if (candidates.length > 1) throw new Error("JSON 解析失败：存在多个 JSON 值，无法确定最终结果。");
  if (!candidates.length) throw new Error("JSON 解析失败：未检测到有效 JSON 值。");
  return candidates[0];
}
