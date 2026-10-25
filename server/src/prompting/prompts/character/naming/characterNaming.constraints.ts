import type {
  CharacterNamingCandidatesOutput,
  CharacterNamingCandidatesPromptInput,
} from "./characterNaming.promptSchemas";

/**
 * 取名结果的确定性校验。只检查用户明确给出的约束、完全重复、字段一致性与数量；
 * 谐音、形近、文化可信度等判断由模型在 readingRisks / rationale 里结构化给出，这里不做字表或拼音判断。
 */

// Control characters are invalid input; spaces, apostrophes, hyphens and transcription
// separators can be legitimate parts of names in the selected language/culture.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
function normalizeName(value: string): string { return value.trim().normalize("NFC"); }

export function collectNamingConstraintViolations(
  output: CharacterNamingCandidatesOutput,
  input: CharacterNamingCandidatesPromptInput,
): string[] {
  const { constraints } = input;
  const violations: string[] = [];
  const currentName = input.character.currentName ? normalizeName(input.character.currentName) : null;
  const taken = new Set(
    [...constraints.forbiddenNames, ...input.existingCastNames].map(normalizeName),
  );
  const forbiddenChars = new Set(constraints.forbiddenChars);
  const seen = new Set<string>();

  if (output.candidates.length < input.candidateCount) {
    violations.push(`需要 ${input.candidateCount} 个候选，实际只有 ${output.candidates.length} 个。`);
  }
  if (output.keepCurrentName.recommended && !currentName) {
    violations.push("人物没有现名，keepCurrentName.recommended 必须为 false。");
  }

  if (output.keepCurrentName.recommended && currentName) {
    const keep = output.keepCurrentName;
    if (constraints.forbiddenNames.map(normalizeName).includes(currentName) || [...currentName].some((char) => forbiddenChars.has(char))) violations.push("现名命中用户禁用约束，不能建议保留。");
    if (constraints.fixedSurname && (keep.surname !== constraints.fixedSurname || !currentName.includes(keep.surname))) violations.push("建议保留时须提供现名真实姓氏并满足固定姓氏约束。");
    if (constraints.generationChar && (!keep.givenName || !currentName.includes(keep.givenName) || [...keep.givenName][constraints.generationChar.position - 1] !== constraints.generationChar.char)) violations.push("建议保留时须提供现名真实的名并满足字辈约束。");
  }
  output.candidates.forEach((candidate, index) => {
    const label = `候选 ${index + 1}「${candidate.name}」`;
    const normalized = normalizeName(candidate.name);

    if (CONTROL_CHARACTERS.test(candidate.name)) {
      violations.push(`${label} 含有控制字符。`);
    }
    if (!candidate.name.includes(candidate.givenName)
      || (candidate.surname !== "" && !candidate.name.includes(candidate.surname))) {
      violations.push(`${label} 的 name 与 surname / givenName 不一致。`);
    }
    if (constraints.fixedSurname && candidate.surname !== constraints.fixedSurname) {
      violations.push(`${label} 没有使用指定姓氏「${constraints.fixedSurname}」。`);
    }
    if (constraints.generationChar) {
      const { char, position } = constraints.generationChar;
      if ([...candidate.givenName][position - 1] !== char) {
        violations.push(`${label} 的名第 ${position} 个字不是字辈「${char}」。`);
      }
    }
    const usedForbidden = [...candidate.name].filter((char) => forbiddenChars.has(char));
    if (usedForbidden.length > 0) {
      violations.push(`${label} 使用了禁用字「${[...new Set(usedForbidden)].join("、")}」。`);
    }
    if (taken.has(normalized)) {
      violations.push(`${label} 与已有角色名或禁用名重复。`);
    }
    if (currentName && normalized === currentName) {
      violations.push(`${label} 与现名相同；保留现名请用 keepCurrentName 表达。`);
    }
    if (seen.has(normalized)) {
      violations.push(`${label} 与前面的候选重复。`);
    }
    seen.add(normalized);
  });

  if (constraints.preference !== "meaningful"
    && output.candidates.length > 0
    && output.candidates.every((candidate) => candidate.register === "meaningful")) {
    violations.push("所有候选都是寓意化名字；至少需要一个符合出身的朴素或常见名字。");
  }
  return violations;
}

/** 校验通过后按请求数量截取；候选只供用户选择，不自动应用。 */
export function validateNamingCandidates(
  output: CharacterNamingCandidatesOutput,
  input: CharacterNamingCandidatesPromptInput,
): CharacterNamingCandidatesOutput {
  const violations = collectNamingConstraintViolations(output, input);
  if (violations.length > 0) {
    throw new Error(`取名候选不符合约束：${violations.join(" ")}`);
  }
  return { ...output, candidates: output.candidates.slice(0, input.candidateCount) };
}
