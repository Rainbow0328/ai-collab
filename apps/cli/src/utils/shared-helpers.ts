/**
 * 共享工具函数，从 index.ts 提取。
 * 这些函数没有外部依赖，可以安全独立。
 */

import { wrapForDisplay } from "@loopmarshal/shared";

/**
 * 格式化并打印 JSON 值到 stdout。
 */
export const printJson = (value: unknown): void => {
  console.log(JSON.stringify(wrapForDisplay(value), null, 2));
};

/**
 * 构建 identity 字符串：sessionName::agentName。
 */
export const buildIdentity = (sessionName: string, agentName: string): string => {
  return `${sessionName}::${agentName}`;
};

/**
 * 动态加载 runtime 模块。
 */
export const loadRuntimeModule = async (): Promise<typeof import("../runtime.js")> => {
  return import("../runtime.js");
};

/**
 * 验证 --identity 选项已提供。
 */
export const requireIdentityOption = (identity: string | undefined): string => {
  if (!identity) {
    throw new Error("必须显式提供 --identity。");
  }
  return identity;
};

/**
 * 判断环境变量值是否为"真"。
 */
export const isTruthyEnvValue = (value: string | undefined): boolean => {
  if (!value) {
    return false;
  }
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
};

/**
 * 从源对象中提取指定键的已定义值。
 */
export const pickDefinedFields = (
  source: Record<string, unknown>,
  keys: string[]
): Record<string, unknown> => {
  const next: Record<string, unknown> = {};
  for (const key of keys) {
    if (source[key] !== undefined) {
      next[key] = source[key];
    }
  }
  return next;
};
