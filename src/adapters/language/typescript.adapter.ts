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

  // Groupes : [1]=async?, [2]=nom, [3]=params
  namedFunctionPattern: /^(async\s+)?function\s+(\w+)\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)/gm,

  // Groupes : [1]=keyword, [2]=nom, [3]=async?, [4]=params (function expr), [5]=params (arrow)
  varFunctionPattern: /^(const|let|var)\s+(\w+)\s*=\s*(async\s+)?(?:function\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)|\(([^)]*(?:\([^)]*\)[^)]*)*)\)\s*(?::[^=]*)?=>)/gm,

  // Groupes : [1]=export?, [2]=nom, [3]=extends?
  classDeclarationPattern: /^(export\s+)?class\s+(\w+)(?:\s+extends\s+(\w[^\s{]*))?/gm,
};
