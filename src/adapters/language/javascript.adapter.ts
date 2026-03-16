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

  // Groupes : [1]=async?, [2]=nom, [3]=params
  namedFunctionPattern: /^(async\s+)?function\s+(\w+)\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)/gm,

  // Groupes : [1]=keyword, [2]=nom, [3]=async?, [4]=params (function expr), [5]=params (arrow)
  varFunctionPattern: /^(const|let|var)\s+(\w+)\s*=\s*(async\s+)?(?:function\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)|\(([^)]*(?:\([^)]*\)[^)]*)*)\)\s*(?::[^=]*)?=>)/gm,

  // Groupes : [1]=export?, [2]=nom, [3]=extends?
  classDeclarationPattern: /^(export\s+)?class\s+(\w+)(?:\s+extends\s+(\w[^\s{]*))?/gm,
};
