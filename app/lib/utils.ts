import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 检测文本是否包含Markdown格式
 * @param text 要检测的文本
 * @returns 是否包含Markdown格式
 */
export function containsMarkdown(text: string): boolean {
  // 检测常见的Markdown语法
  const markdownPatterns = [
    /^#+\s+.+$/m,                // 标题
    /\*\*.+\*\*/,                // 粗体
    /\*.+\*/,                    // 斜体
    /^>\s+.+$/m,                 // 引用
    /^-\s+.+$/m,                 // 无序列表
    /^[0-9]+\.\s+.+$/m,          // 有序列表
    /\[.+\]\(.+\)/,              // 链接
    /!\[.+\]\(.+\)/,             // 图片
    /^```[\s\S]*?```$/m,         // 代码块
    /`[^`]+`/,                   // 行内代码
    /^---+$/m,                   // 分隔线
    /\|.+\|.+\|/,                // 表格
    /~~.+~~/,                    // 删除线
    /^:::[\s\S]*?:::$/m,         // 提示块
    /\$\$.+\$\$/,                // 数学公式块
    /\$.+\$/                     // 行内数学公式
  ];

  // 如果文本匹配任何一个Markdown模式，则返回true
  return markdownPatterns.some(pattern => pattern.test(text));
} 