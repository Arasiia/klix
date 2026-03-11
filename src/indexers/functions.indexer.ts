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

export interface FunctionEntry {
  name: string;
  signature: string;
  jsDoc?: string;
  file: string;
  isAsync: boolean;
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

export function extractServiceMethods(content: string, filePath: string, includeJsDoc: boolean): FunctionEntry[] {
  const results: FunctionEntry[] = [];
  const file = relative(process.cwd(), filePath).replace(/\\/g, "/");

  const SKIP = new Set(["constructor", "if", "for", "while", "switch", "catch"]);
  const seen = new Set<number>();

  const methodPattern = /^  (async\s+)?(\w+)\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)/gm;
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
    });
  }

  const arrowPattern = /^  (\w+):\s*(async\s*)?\(([^)]*(?:\([^)]*\)[^)]*)*)\)\s*=>/gm;
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
    });
  }

  return results;
}

/** Helper interne : collecte toutes les fonctions sans sérialisation */
function collectFunctions(rootDir: string, config: KlixConfig): FunctionEntry[] {
  const { includeJsDoc, servicePattern, excludeTsx } = config.indexers.functions;
  const langAdapter = findLanguageAdapter(config.language) ?? typescriptAdapter;

  const allFiles = walkFiles(rootDir, config.include, config.exclude);
  const allFunctions: FunctionEntry[] = [];

  const servicePatterns = Array.isArray(servicePattern) ? servicePattern : [servicePattern];
  const serviceFiles = walkFiles(rootDir, servicePatterns, config.exclude);
  const serviceFileSet = new Set(serviceFiles);

  for (const filePath of allFiles) {
    if (excludeTsx && filePath.endsWith(".tsx")) continue;
    if (filePath.endsWith(".tsx")) continue;

    let content = "";
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    if (serviceFileSet.has(filePath) && langAdapter.extractServiceMethods) {
      allFunctions.push(...extractServiceMethods(content, filePath, includeJsDoc));
    } else {
      allFunctions.push(...extractExportedFunctions(content, filePath, includeJsDoc, langAdapter));
    }
  }

  return allFunctions;
}

/** Retourne les fonctions groupées par domaine (premier segment significatif du chemin) */
export function runFunctionsIndexerGrouped(rootDir: string, config: KlixConfig): Map<string, FunctionEntry[]> {
  const allFunctions = collectFunctions(rootDir, config);
  const byDomain = new Map<string, FunctionEntry[]>();
  for (const fn of allFunctions) {
    const domain = extractDomain(fn.file);
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
      lines.push(`- **${asyncMark}${fn.name}**\`${fn.signature}\``);
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

  const lines: string[] = [`# FUNCTIONS — ${config.name}`, ``, `> ${allFunctions.length} fonctions exportées`, ``];

  for (const [file, fns] of byFile) {
    lines.push(`## \`${file}\``);
    for (const fn of fns) {
      const asyncMark = fn.isAsync ? "async " : "";
      lines.push(`- **${asyncMark}${fn.name}**\`${fn.signature}\``);
      if (fn.jsDoc) lines.push(`  > ${fn.jsDoc}`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}
