import i18next from "i18next";

/**
 * 普适的多语言文本配置接口 (Universal Localized Text Map)
 * 可直接支持任意扩充语言 (zh, en, ja, fr, ko, es ...)
 */
export type LocalizedTextMap = Record<string, string>;
export type LocalizedInput = string | LocalizedTextMap | null | undefined;

/**
 * 普适的多语言显示文本解析器 (Universal Display Text Resolver)
 * 
 * 原理：
 * 1. 如果传入的是多语言映射对象 { zh: '...', en: '...', ja: '...' }，根据系统当前激活的 i18n 语言自动读取对应的文本，方便未来的无线语言扩展。
 * 2. 如果传入的是 string (i18n key 或通用词条)，通过 i18next 统一检索与参数插值。
 */
export function resolveDisplayText(
  input: LocalizedInput,
  interpolationParams?: Record<string, unknown>
): string {
  if (!input) return "";

  if (typeof input === "string") {
    return i18next.t(input, interpolationParams);
  }

  const currentLang = (i18next.language || "zh").toLowerCase();
  const langShort = currentLang.split("-")[0];

  if (input[currentLang]) return input[currentLang];
  if (input[langShort]) return input[langShort];
  if (input["zh"]) return input["zh"];
  if (input["en"]) return input["en"];

  const firstKey = Object.keys(input)[0];
  return firstKey ? input[firstKey] : "";
}

/**
 * 创建通用领域多语言映射器
 */
export function createLocalizedResolver(dictionary: Record<string, LocalizedTextMap>) {
  return function resolve(rawText: string): string {
    if (!rawText) return "";
    const entry = dictionary[rawText];
    if (entry) {
      return resolveDisplayText(entry);
    }
    return resolveDisplayText(rawText);
  };
}
