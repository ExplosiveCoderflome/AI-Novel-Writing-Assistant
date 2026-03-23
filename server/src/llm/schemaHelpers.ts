import { z } from "zod";

// 常用的 Zod 基础构件，用于让不同 LLM 输出在校验时保持宽容。

// 允许 `["a","b"]` 或 `"a,b"` 之类的字符串/数组输入，统一为字符串数组，并去重裁剪。
export function stringOrArraySchema(maxItems: number) {
  const nonEmptyString = z.string().trim().min(1);
  return z
    .union([z.array(nonEmptyString), nonEmptyString])
    .transform((value) => (Array.isArray(value) ? value : [value]))
    .transform((list) => {
      const unique = Array.from(new Set(list.map((item) => item.trim()).filter(Boolean)));
      return unique.slice(0, maxItems);
    });
}

// 宽容枚举：支持大小写不敏感的匹配。
export function tolerantEnum<T extends string>(values: readonly T[]) {
  const lowerMap = new Map(values.map((v) => [v.toLowerCase(), v]));
  return z
    .string()
    .trim()
    .transform((v) => v.toLowerCase())
    .refine((v) => lowerMap.has(v), {
      message: `Invalid enum value. Expected one of: ${values.join(", ")}`,
    })
    .transform((v) => lowerMap.get(v) as T) as z.ZodType<T>;
}

// 宽容数字：允许 `"24"` 这种字符串输入，转成 number。
export const coerceInt = z.coerce.number().int();

