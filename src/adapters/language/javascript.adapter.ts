import type { LanguageAdapter } from "./_base";

export const javascriptAdapter: LanguageAdapter = {
  id: "javascript",
  name: "JavaScript",
  extensions: [".js", ".jsx"],
  extractServiceMethods: true,
  exportFunctionPattern: /^(export\s+(async\s+)?function\s+(\w+))\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)/gm,
  exportConstArrowPattern: /^export\s+const\s+(\w+)\s*=\s*(async\s*)?\(([^)]*(?:\([^)]*\)[^)]*)*)\)\s*=>/gm,
  interfacePattern: /export\s+interface\s+(\w+)\s*(?:extends\s+[^{]+)?\{([^}]+)\}/gs,
  typeAliasPattern: /export\s+type\s+(\w+)\s*=\s*([^;]+);/g,
  enumPattern: /export\s+enum\s+(\w+)\s*\{([^}]+)\}/gs,
};
