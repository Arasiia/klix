import { readFileSync } from "fs";
import { relative } from "path";
import { walkFiles } from "../lib/walker";
import type { KlixConfig } from "../lib/config";
import { findLanguageAdapter } from "../adapters";
import { typescriptAdapter } from "../adapters/language/typescript.adapter";
import type { LanguageAdapter } from "../adapters";
import { extractDomain } from "../lib/domain-splitter";

/** Découpe une chaîne par `sep` en ignorant les séparateurs imbriqués dans `<>`, `{}`, `()`, `[]` */
function splitTopLevel(str: string, sep: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of str) {
    if (ch === "(" || ch === "{" || ch === "[" || ch === "<") depth++;
    else if (ch === ")" || ch === "}" || ch === "]" || ch === ">") depth--;
    if (ch === sep && depth === 0) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) result.push(current);
  return result;
}

/** Simplifie les types TypeScript complexes pour l'affichage */
function simplifyType(type: string): string {
  return type
    .replace(/Partial<typeof [^>]+>/g, "Partial<...>")
    .replace(/\{[^}]{30,}/g, "{...")
    .replace(/\s+/g, " ")
    .trim();
}

/** Construit une signature typée lisible depuis les params bruts TypeScript */
function buildTypedSignature(rawParams: string): string {
  const normalized = rawParams.replace(/\s+/g, " ").trim();
  if (!normalized) return "()";

  const parts = splitTopLevel(normalized, ",");
  const cleaned = parts
    .map((p) => {
      const t = p.trim();
      if (!t) return null;
      const colonIdx = t.indexOf(":");
      if (colonIdx === -1) return t;
      const name = t.slice(0, colonIdx).trim();
      const type = simplifyType(t.slice(colonIdx + 1).trim());
      return type ? `${name}: ${type}` : name;
    })
    .filter(Boolean);

  return `(${cleaned.join(", ")})`;
}

/**
 * Extrait la signature (noms des paramètres sans types) d'une fonction à partir
 * d'une position dans le contenu source.
 * @param content Contenu du fichier source
 * @param startIdx Position de début de la déclaration de fonction
 */
export function extractSignature(content: string, startIdx: number): string {
  let i = startIdx;
  // Trouver l'ouverture de parenthèse
  while (i < content.length && content[i] !== "(") i++;
  if (i >= content.length) return "()";

  // Trouver la parenthèse fermante correspondante avec comptage de profondeur
  let depth = 0;
  const paramStart = i + 1;
  let paramEnd = paramStart;
  for (; i < content.length; i++) {
    if (content[i] === "(") depth++;
    else if (content[i] === ")") {
      depth--;
      if (depth === 0) {
        paramEnd = i;
        break;
      }
    }
  }

  const rawParams = content.slice(paramStart, paramEnd).trim();
  if (!rawParams) return "()";

  const parts = splitTopLevel(rawParams, ",");
  const names = parts
    .map((p) => {
      const t = p.trim();
      if (!t) return null;
      const colonIdx = t.indexOf(":");
      return colonIdx === -1 ? t : t.slice(0, colonIdx).trim();
    })
    .filter(Boolean);

  return `(${names.join(", ")})`;
}

export type FunctionKind =
  | "exported"
  | "named"
  | "class-method"
  | "prototype"
  | "cjs-export"
  | "default-export"
  | "generator";

export interface FunctionEntry {
  name: string;
  signature: string;
  jsDoc?: string;
  file: string;
  isAsync: boolean;
  kind?: FunctionKind;
}

export function extractJsDoc(content: string, funcStart: number): string | undefined {
  const before = content.slice(0, funcStart);

  const jsdocBlocks = [...before.matchAll(/\/\*\*([\s\S]*?)\*\//g)];
  if (jsdocBlocks.length === 0) return undefined;
  const lastBlock = jsdocBlocks[jsdocBlocks.length - 1];

  const afterBlock = before.slice(lastBlock.index! + lastBlock[0].length);
  if (afterBlock.trim() !== "") return undefined;

  const rawLines = lastBlock[1]
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, "").trim())
    .filter((l) => l.length > 0);

  const descLines: string[] = [];
  const params: string[] = [];
  let returns: string | undefined;

  for (const line of rawLines) {
    if (line.startsWith("@param ")) {
      const rest = line.slice("@param ".length);
      const typeMatch = rest.match(/^\{([^}]+)\}\s*(.*)/);
      if (typeMatch) {
        params.push("`@param` `{" + typeMatch[1] + "}` " + typeMatch[2]);
      } else {
        params.push("`@param` " + rest);
      }
    } else if (line.startsWith("@returns ") || line.startsWith("@return ")) {
      const rest = line.startsWith("@returns ") ? line.slice("@returns ".length) : line.slice("@return ".length);
      const typeMatch = rest.match(/^\{([^}]+)\}\s*(.*)/);
      if (typeMatch) {
        returns = "`@returns` `{" + typeMatch[1] + "}` " + typeMatch[2];
      } else {
        returns = "`@returns` " + rest;
      }
    } else if (!line.startsWith("@")) {
      descLines.push(line);
    }
  }

  const parts: string[] = [];
  if (descLines.length > 0) parts.push(descLines.join(" "));
  for (const p of params) parts.push(p);
  if (returns) parts.push(returns);

  if (parts.length === 0) return undefined;
  return parts.join("\n  > ");
}

export function extractExportedFunctions(
  content: string,
  filePath: string,
  includeJsDoc: boolean,
  langAdapter: LanguageAdapter = typescriptAdapter,
): FunctionEntry[] {
  const results: FunctionEntry[] = [];
  const file = relative(process.cwd(), filePath).replace(/\\/g, "/");

  const exportFnPattern = new RegExp(langAdapter.exportFunctionPattern.source, langAdapter.exportFunctionPattern.flags);
  let match;
  while ((match = exportFnPattern.exec(content)) !== null) {
    const jsDoc = includeJsDoc ? extractJsDoc(content, match.index) : undefined;
    results.push({
      name: match[3],
      signature: buildTypedSignature(match[4]),
      jsDoc,
      file,
      isAsync: !!match[2],
    });
  }

  const exportConstPattern = new RegExp(
    langAdapter.exportConstArrowPattern.source,
    langAdapter.exportConstArrowPattern.flags,
  );
  while ((match = exportConstPattern.exec(content)) !== null) {
    const jsDoc = includeJsDoc ? extractJsDoc(content, match.index) : undefined;
    results.push({
      name: match[1],
      signature: buildTypedSignature(match[3]),
      jsDoc,
      file,
      isAsync: !!match[2],
    });
  }

  return results;
}

export function extractClassMethods(content: string, filePath: string, includeJsDoc: boolean): FunctionEntry[] {
  const results: FunctionEntry[] = [];
  const file = relative(process.cwd(), filePath).replace(/\\/g, "/");

  const SKIP = new Set(["constructor", "if", "for", "while", "switch", "catch"]);
  const seen = new Set<number>();

  // Méthodes standard (2+ espaces d'indentation)
  const methodPattern = /^\s{2,}(async\s+)?(\w+)\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)/gm;
  let match;
  while ((match = methodPattern.exec(content)) !== null) {
    const name = match[2];
    if (SKIP.has(name)) continue;
    seen.add(match.index);

    const jsDoc = includeJsDoc ? extractJsDoc(content, match.index) : undefined;
    results.push({
      name,
      signature: buildTypedSignature(match[3]),
      jsDoc,
      file,
      isAsync: !!match[1],
      kind: "class-method",
    });
  }

  // Méthodes statiques
  const staticPattern = /^\s{2,}static\s+(async\s+)?(\w+)\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)/gm;
  while ((match = staticPattern.exec(content)) !== null) {
    if (seen.has(match.index)) continue;
    const name = match[2];
    if (SKIP.has(name)) continue;

    const jsDoc = includeJsDoc ? extractJsDoc(content, match.index) : undefined;
    results.push({
      name,
      signature: buildTypedSignature(match[3]),
      jsDoc,
      file,
      isAsync: !!match[1],
      kind: "class-method",
    });
  }

  // Arrow methods dans les classes (propriétés)
  const arrowPattern = /^\s{2,}(\w+):\s*(async\s*)?\(([^)]*(?:\([^)]*\)[^)]*)*)\)\s*=>/gm;
  while ((match = arrowPattern.exec(content)) !== null) {
    if (seen.has(match.index)) continue;
    const name = match[1];
    if (SKIP.has(name)) continue;

    const jsDoc = includeJsDoc ? extractJsDoc(content, match.index) : undefined;
    results.push({
      name,
      signature: buildTypedSignature(match[3]),
      jsDoc,
      file,
      isAsync: !!match[2],
      kind: "class-method",
    });
  }

  return results;
}

/** @deprecated Utiliser extractClassMethods */
export function extractServiceMethods(content: string, filePath: string, includeJsDoc: boolean): FunctionEntry[] {
  return extractClassMethods(content, filePath, includeJsDoc);
}

/**
 * Extrait toutes les fonctions d'un fichier : exportées, nommées, class methods,
 * prototype, CJS exports, default exports, generators.
 */
export function extractAllFunctions(
  content: string,
  filePath: string,
  includeJsDoc: boolean,
  langAdapter: LanguageAdapter = typescriptAdapter,
): FunctionEntry[] {
  const results: FunctionEntry[] = [];
  const file = relative(process.cwd(), filePath).replace(/\\/g, "/");
  const capturedNames = new Set<string>();

  // 1. Generator functions (avant exported pour éviter doublons)
  const generatorPattern = /^(export\s+)?(async\s+)?function\s*\*\s*(\w+)\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)/gm;
  let match;
  while ((match = generatorPattern.exec(content)) !== null) {
    const jsDoc = includeJsDoc ? extractJsDoc(content, match.index) : undefined;
    results.push({
      name: match[3],
      signature: buildTypedSignature(match[4]),
      jsDoc,
      file,
      isAsync: !!match[2],
      kind: "generator",
    });
    capturedNames.add(match[3]);
  }

  // 2. Export default function
  const defaultExportPattern = /^export\s+default\s+(async\s+)?function\s*(\w*)\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)/gm;
  while ((match = defaultExportPattern.exec(content)) !== null) {
    const name = match[2] || "default";
    if (capturedNames.has(name)) continue;
    const jsDoc = includeJsDoc ? extractJsDoc(content, match.index) : undefined;
    results.push({
      name,
      signature: buildTypedSignature(match[3]),
      jsDoc,
      file,
      isAsync: !!match[1],
      kind: "default-export",
    });
    capturedNames.add(name);
  }

  // 3. Exported functions (existant)
  const exported = extractExportedFunctions(content, filePath, includeJsDoc, langAdapter);
  for (const fn of exported) {
    if (capturedNames.has(fn.name)) continue;
    fn.kind = "exported";
    results.push(fn);
    capturedNames.add(fn.name);
  }

  // 4. Named functions non-exportées (adapter pattern)
  if (langAdapter.namedFunctionPattern) {
    const namedPattern = new RegExp(langAdapter.namedFunctionPattern.source, langAdapter.namedFunctionPattern.flags);
    while ((match = namedPattern.exec(content)) !== null) {
      const name = match[2];
      if (capturedNames.has(name)) continue;
      // Vérifier que ce n'est pas une ligne exportée
      const lineStart = content.lastIndexOf("\n", match.index) + 1;
      const linePrefix = content.slice(lineStart, match.index);
      if (linePrefix.includes("export")) continue;
      const jsDoc = includeJsDoc ? extractJsDoc(content, match.index) : undefined;
      results.push({
        name,
        signature: buildTypedSignature(match[3]),
        jsDoc,
        file,
        isAsync: !!match[1],
        kind: "named",
      });
      capturedNames.add(name);
    }
  }

  // 5. Variable functions non-exportées (adapter pattern)
  if (langAdapter.varFunctionPattern) {
    const varPattern = new RegExp(langAdapter.varFunctionPattern.source, langAdapter.varFunctionPattern.flags);
    while ((match = varPattern.exec(content)) !== null) {
      const name = match[2];
      if (capturedNames.has(name)) continue;
      // Vérifier que ce n'est pas une ligne exportée
      const lineStart = content.lastIndexOf("\n", match.index) + 1;
      const linePrefix = content.slice(lineStart, match.index);
      if (linePrefix.includes("export")) continue;
      const params = match[4] ?? match[5] ?? "";
      const jsDoc = includeJsDoc ? extractJsDoc(content, match.index) : undefined;
      results.push({
        name,
        signature: buildTypedSignature(params),
        jsDoc,
        file,
        isAsync: !!match[3],
        kind: "named",
      });
      capturedNames.add(name);
    }
  }

  // 6. Prototype methods (universel)
  const protoPattern = /^(\w[\w.]*?)\.prototype\.(\w+)\s*=\s*(async\s+)?function/gm;
  while ((match = protoPattern.exec(content)) !== null) {
    const name = `${match[1]}.prototype.${match[2]}`;
    const jsDoc = includeJsDoc ? extractJsDoc(content, match.index) : undefined;
    results.push({
      name,
      signature: extractSignature(content, match.index),
      jsDoc,
      file,
      isAsync: !!match[3],
      kind: "prototype",
    });
  }

  // 7. CJS exports: module.exports.name = function / exports.name = function
  const cjsNamedPattern = /^(?:module\.)?exports\.(\w+)\s*=\s*(async\s+)?function/gm;
  while ((match = cjsNamedPattern.exec(content)) !== null) {
    const name = match[1];
    if (capturedNames.has(name)) continue;
    const jsDoc = includeJsDoc ? extractJsDoc(content, match.index) : undefined;
    results.push({
      name,
      signature: extractSignature(content, match.index),
      jsDoc,
      file,
      isAsync: !!match[2],
      kind: "cjs-export",
    });
    capturedNames.add(name);
  }

  // CJS: module.exports = function name()
  const cjsDefaultPattern = /^module\.exports\s*=\s*(async\s+)?function\s+(\w+)/gm;
  while ((match = cjsDefaultPattern.exec(content)) !== null) {
    const name = match[2];
    if (capturedNames.has(name)) continue;
    const jsDoc = includeJsDoc ? extractJsDoc(content, match.index) : undefined;
    results.push({
      name,
      signature: extractSignature(content, match.index),
      jsDoc,
      file,
      isAsync: !!match[1],
      kind: "cjs-export",
    });
    capturedNames.add(name);
  }

  // 8. Class methods (tous les fichiers)
  const classMethods = extractClassMethods(content, filePath, includeJsDoc);
  results.push(...classMethods);

  return results;
}

/** Helper interne : collecte toutes les fonctions sans sérialisation */
function collectFunctions(rootDir: string, config: KlixConfig): FunctionEntry[] {
  const { includeJsDoc, excludeTsx } = config.indexers.functions;
  const langAdapter = findLanguageAdapter(config.language) ?? typescriptAdapter;

  const allFiles = walkFiles(rootDir, config.include, config.exclude);
  const allFunctions: FunctionEntry[] = [];

  for (const filePath of allFiles) {
    if (excludeTsx && filePath.endsWith(".tsx")) continue;

    let content = "";
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    allFunctions.push(...extractAllFunctions(content, filePath, includeJsDoc, langAdapter));
  }

  return allFunctions;
}

/** Retourne les fonctions groupées par domaine (premier segment significatif du chemin) */
export function runFunctionsIndexerGrouped(rootDir: string, config: KlixConfig): Map<string, FunctionEntry[]> {
  const allFunctions = collectFunctions(rootDir, config);
  const byDomain = new Map<string, FunctionEntry[]>();
  for (const fn of allFunctions) {
    const domain = extractDomain(fn.file, config.domainDepth ?? 1);
    if (!byDomain.has(domain)) byDomain.set(domain, []);
    byDomain.get(domain)!.push(fn);
  }
  return byDomain;
}

/** Sérialise les fonctions d'un domaine pour un fichier de split */
export function serializeFunctionsSection(domain: string, entries: FunctionEntry[], config: KlixConfig): string {
  const byFile = new Map<string, FunctionEntry[]>();
  for (const fn of entries) {
    if (!byFile.has(fn.file)) byFile.set(fn.file, []);
    byFile.get(fn.file)!.push(fn);
  }

  const lines: string[] = [
    `# FUNCTIONS/${domain} — ${config.name}`,
    ``,
    `> ${entries.length} fonctions · domaine: ${domain}`,
    ``,
  ];

  for (const [file, fns] of byFile) {
    lines.push(`## \`${file}\``);
    for (const fn of fns) {
      const asyncMark = fn.isAsync ? "async " : "";
      const kindBadge = fn.kind && fn.kind !== "exported" ? ` \`${fn.kind}\`` : "";
      lines.push(`- **${asyncMark}${fn.name}**\`${fn.signature}\`${kindBadge}`);
      if (fn.jsDoc) lines.push(`  > ${fn.jsDoc}`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}

export function runFunctionsIndexer(rootDir: string, config: KlixConfig): string {
  const allFunctions = collectFunctions(rootDir, config);

  // Group by file
  const byFile = new Map<string, FunctionEntry[]>();
  for (const fn of allFunctions) {
    if (!byFile.has(fn.file)) byFile.set(fn.file, []);
    byFile.get(fn.file)!.push(fn);
  }

  const lines: string[] = [`# FUNCTIONS — ${config.name}`, ``, `> ${allFunctions.length} fonctions`, ``];

  for (const [file, fns] of byFile) {
    lines.push(`## \`${file}\``);
    for (const fn of fns) {
      const asyncMark = fn.isAsync ? "async " : "";
      const kindBadge = fn.kind && fn.kind !== "exported" ? ` \`${fn.kind}\`` : "";
      lines.push(`- **${asyncMark}${fn.name}**\`${fn.signature}\`${kindBadge}`);
      if (fn.jsDoc) lines.push(`  > ${fn.jsDoc}`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}
