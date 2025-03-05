/**
 * 获取必需的环境变量
 * @param key 环境变量名
 * @returns 环境变量值
 * @throws 如果环境变量未定义
 */
export function getRequiredEnvVar(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`必需的环境变量 ${key} 未定义`);
  }
  return value;
}

/**
 * 获取可选的环境变量
 * @param key 环境变量名
 * @param defaultValue 默认值
 * @returns 环境变量值或默认值
 */
export function getOptionalEnvVar(key: string, defaultValue: string = ''): string {
  const value = process.env[key];
  return value || defaultValue;
} 