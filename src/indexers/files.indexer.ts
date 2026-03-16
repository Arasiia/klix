import { readFileSync } from "fs";
import { relative } from "path";
import { walkFiles } from "../lib/walker";
import type { KlixConfig } from "../lib/config";
import { extractDomain } from "../lib/domain-splitter";

export interface FileEntry {
  path: string;
  role: string;
  exports: string[];
  lines: number;
}

export function detectRole(relPath: string, config: KlixConfig): string {
  const rolePatterns = config.indexers.files.rolePatterns ?? {};
  for (const [role, patterns] of Object.entries(rolePatterns)) {
    if (patterns.some((p) => relPath.includes(p.replace(/\*/g, "")))) return role;
  }

  if (relPath.includes(".routes.")) return "route";
  if (relPath.includes(".service.")) return "service";
  if (relPath.includes(".schema.") || relPath.match(/db\/schema\//)) return "db-schema";
  if (relPath.match(/hooks\/use-/)) return "hook";
  if (relPath.includes(".api.")) return "api-client";
  if (relPath.includes(".store.")) return "store";
  if (relPath.includes(".types.") || relPath.includes(".type.")) return "types";
  if (relPath.includes("plugin")) return "plugin";
  if (relPath.includes("util") || relPath.includes("lib/")) return "util";
  if (relPath.match(/\.(tsx|jsx)$/)) return "component";
  if (relPath.includes("index.")) return "entry";
  return "module";
}

export function extractExports(content: string): string[] {
  const exports: string[] = [];
  const patterns = [
    /^export\s+(?:const|class|function|async\s+function|type|interface|enum)\s+(\w+)/gm,
    /^export\s+default\s+(?:class|function)?\s*(\w+)/gm,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (match[1] && !exports.includes(match[1])) exports.push(match[1]);
    }
  }
  return exports.slice(0, 8); // max 8 exports par fichier
}

function countLines(content: string): number {
  return content.split("\n").length;
}

/** Helper interne : collecte tous les fichiers sans sérialisation */
function collectFiles(rootDir: string, config: KlixConfig): FileEntry[] {
  const files = walkFiles(rootDir, config.include, config.exclude);
  const entries: FileEntry[] = [];

  for (const filePath of files) {
    const relPath = relative(rootDir, filePath).replace(/\\/g, "/");
    let content = "";
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    entries.push({
      path: relPath,
      role: detectRole(relPath, config),
      exports: extractExports(content),
      lines: countLines(content),
    });
  }

  return entries;
}

/** Retourne les fichiers groupés par domaine (premier segment significatif du chemin) */
export function runFilesIndexerGrouped(rootDir: string, config: KlixConfig): Map<string, FileEntry[]> {
  const entries = collectFiles(rootDir, config);
  const byDomain = new Map<string, FileEntry[]>();
  for (const entry of entries) {
    const domain = extractDomain(entry.path, config.domainDepth ?? 1);
    if (!byDomain.has(domain)) byDomain.set(domain, []);
    byDomain.get(domain)!.push(entry);
  }
  return byDomain;
}

/** Sérialise les fichiers d'un domaine pour un fichier de split */
export function serializeFilesSection(domain: string, entries: FileEntry[], config: KlixConfig): string {
  const lines: string[] = [
    `# FILES/${domain} — ${config.name}`,
    ``,
    `> ${entries.length} fichiers · domaine: ${domain}`,
    ``,
    `| Fichier | Rôle | Exports | Lignes |`,
    `|---------|------|---------|--------|`,
  ];

  for (const e of entries) {
    const exportsStr = e.exports.length ? e.exports.join(", ") : "—";
    lines.push(`| \`${e.path}\` | ${e.role} | ${exportsStr} | ${e.lines} |`);
  }
  lines.push(``);

  return lines.join("\n");
}

export function runFilesIndexer(rootDir: string, config: KlixConfig): string {
  const entries = collectFiles(rootDir, config);

  // Group by role
  const byRole = new Map<string, FileEntry[]>();
  for (const entry of entries) {
    if (!byRole.has(entry.role)) byRole.set(entry.role, []);
    byRole.get(entry.role)!.push(entry);
  }

  const roleOrder = [
    "entry",
    "route",
    "service",
    "db-schema",
    "hook",
    "api-client",
    "store",
    "types",
    "plugin",
    "util",
    "component",
    "module",
  ];
  const sortedRoles = [
    ...roleOrder.filter((r) => byRole.has(r)),
    ...[...byRole.keys()].filter((r) => !roleOrder.includes(r)),
  ];

  const lines: string[] = [`# FILES — ${config.name}`, ``, `> ${entries.length} fichiers indexés`, ``];

  for (const role of sortedRoles) {
    const group = byRole.get(role)!;
    lines.push(`## ${role} (${group.length})`);
    lines.push(`| Fichier | Exports | Lignes |`);
    lines.push(`|---------|---------|--------|`);
    for (const e of group) {
      const exportsStr = e.exports.length ? e.exports.join(", ") : "—";
      lines.push(`| \`${e.path}\` | ${exportsStr} | ${e.lines} |`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}
