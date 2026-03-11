import type { LanguageAdapter } from "./_base";

export const typescriptAdapter: LanguageAdapter = {
  id: "typescript",
  name: "TypeScript",
  extensions: [".ts", ".tsx"],
  extractServiceMethods: true,

  // Groupes : [1]=full prefix, [2]=async?, [3]=nom, [4]=params
  exportFunctionPattern: /^(export\s+(async\s+)?function\s+(\w+))\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)/gm,

  // Groupes : [1]=nom, [2]=async?, [3]=params
  exportConstArrowPattern: /^export\s+const\s+(\w+)\s*=\s*(async\s*)?\(([^)]*(?:\([^)]*\)[^)]*)*)\)\s*=>/gm,

  // Groupes : [1]=nom, [2]=corps
  interfacePattern: /export\s+interface\s+(\w+)\s*(?:extends\s+[^{]+)?\{([^}]+)\}/gs,

  // Groupes : [1]=nom, [2]=valeur
  typeAliasPattern: /export\s+type\s+(\w+)\s*=\s*([^;]+);/g,

  // Groupes : [1]=nom, [2]=corps
  enumPattern: /export\s+enum\s+(\w+)\s*\{([^}]+)\}/gs,
};
