import {
  CREATIVE_PROFILE_SCHEMA_VERSION,
  creativeProfileInputSchema,
  creativeProfileSchema,
  type CreativeProfile,
  type CreativeProfileIssue,
  type CreativeProfileIssueCode,
} from "@ai-novel/shared/types/creativeProfile";

export type { CreativeProfileIssue, CreativeProfileIssueCode };

/**
 * 读取结果区分三种状态。invalid 不能被调用方当作 unset 处理：
 * unset 才回到旧的网文行为，invalid 必须保持中性并提示用户重新选择。
 */
export type CreativeProfileReadResult =
  | { status: "unset" }
  | { status: "valid"; profile: CreativeProfile }
  | { status: "invalid"; issue: CreativeProfileIssue };

/** Novel 的单个可空 TEXT 列；版本号只存在 JSON 内的 schemaVersion。 */
export interface StoredCreativeProfileFields {
  creativeProfileJson?: string | null;
}

export type CreativeProfileInputResult =
  | { success: true; profile: CreativeProfile }
  | { success: false; message: string };

function summarizeIssues(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): string {
  return issues
    .slice(0, 3)
    .map((issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

function invalid(code: CreativeProfileIssueCode, message: string): CreativeProfileReadResult {
  return { status: "invalid", issue: { code, message } };
}

export function readStoredCreativeProfile(
  stored: StoredCreativeProfileFields | null | undefined,
): CreativeProfileReadResult {
  const json = stored?.creativeProfileJson;
  if (json == null || json.trim() === "") {
    return { status: "unset" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return invalid("malformed_json", "创作取向配置不是合法 JSON。");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return invalid("invalid_shape", "创作取向配置必须是对象。");
  }

  const payloadVersion = (parsed as { schemaVersion?: unknown }).schemaVersion;
  if (typeof payloadVersion === "number" && payloadVersion !== CREATIVE_PROFILE_SCHEMA_VERSION) {
    return invalid("unsupported_version", `不支持的创作取向配置版本：${payloadVersion}。`);
  }

  const result = creativeProfileSchema.safeParse(parsed);
  if (!result.success) {
    return invalid("invalid_shape", summarizeIssues(result.error.issues));
  }
  return { status: "valid", profile: result.data };
}

/** 校验用户/HTTP 输入；省略版本号时补为当前版本。 */
export function parseCreativeProfileInput(input: unknown): CreativeProfileInputResult {
  const result = creativeProfileInputSchema.safeParse(input);
  if (!result.success) {
    return { success: false, message: summarizeIssues(result.error.issues) };
  }
  return { success: true, profile: result.data };
}

/**
 * 序列化为可空列。传入 null 表示清除设置；传入的配置先按已保存格式校验，非法配置直接抛错，
 * 不写入数据库。
 */
export function serializeCreativeProfile(profile: CreativeProfile | null): { creativeProfileJson: string | null } {
  if (profile === null) {
    return { creativeProfileJson: null };
  }
  const validated = creativeProfileSchema.parse(profile);
  return { creativeProfileJson: JSON.stringify(validated) };
}

/**
 * 读取投影给前端的配置视图。invalid 只回传问题说明，不回传可能被误当作网文的半截配置。
 */
export function projectStoredCreativeProfile(stored: StoredCreativeProfileFields | null | undefined): {
  creativeProfile: CreativeProfile | null;
  creativeProfileIssue: CreativeProfileIssue | null;
} {
  const read = readStoredCreativeProfile(stored);
  if (read.status === "valid") return { creativeProfile: read.profile, creativeProfileIssue: null };
  if (read.status === "invalid") return { creativeProfile: null, creativeProfileIssue: read.issue };
  return { creativeProfile: null, creativeProfileIssue: null };
}

/** Omission recovers a validated seed; an explicit null is a choice and must win. */
export function recoverCreativeProfilePreference(explicit: CreativeProfile | null | undefined, ...saved: unknown[]): CreativeProfile | null | undefined {
  if (explicit !== undefined) return explicit === null ? null : creativeProfileSchema.parse(explicit);
  for (const value of saved) {
    if (value === undefined) continue;
    if (value === null) return null;
    const parsed = creativeProfileSchema.safeParse(value);
    if (parsed.success) return parsed.data;
    throw new Error("保存的创作取向无法读取，请重新选择后继续；不会自动改用网文默认。");
  }
  return undefined;
}
