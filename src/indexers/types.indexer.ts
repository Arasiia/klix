import { readFileSync } from "fs";
import { relative } from "path";
import { globFiles } from "../lib/walker";
import type { KlixConfig } from "../lib/config";
import { findLanguageAdapter } from "../adapters";
import { typescriptAdapter } from "../adapters/language/typescript.adapter";
import type { LanguageAdapter } from "../adapters";
import { extractDomain } from "../lib/domain-splitter";

export interface TypeEntry {
  kind: "interface" | "type" | "enum";
  name: string;
  fields: string[];
  file: string;
}

export function extractInterfaces(
  content: string,
  file: string,
  langAdapter: LanguageAdapter = typescriptAdapter,
): TypeEntry[] {
  const results: TypeEntry[] = [];
  const pattern = new RegExp(langAdapter.interfacePattern.source, langAdapter.interfacePattern.flags);
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const fields = match[2]
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("//") && !l.startsWith("*"))
      .map((l) => l.replace(/;$/, "").trim())
      .filter((l) => l.includes(":"))
      .map((l) => {
        const [name] = l.split(":");
        return name.replace(/\?$/, "").trim();
      })
      .filter(Boolean)
      .slice(0, 10);

    results.push({ kind: "interface", name: match[1], fields, file });
  }
  return results;
}

export function extractTypeAliases(
  content: string,
  file: string,
  langAdapter: LanguageAdapter = typescriptAdapter,
): TypeEntry[] {
  const results: TypeEntry[] = [];
  const pattern = new RegExp(langAdapter.typeAliasPattern.source, langAdapter.typeAliasPattern.flags);
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const value = match[2].trim();
    if (value.includes("|") || value.includes("{")) {
      const fields = value.includes("|")
        ? value
            .split("|")
            .map((v) => v.trim().replace(/['"]/g, ""))
            .slice(0, 8)
        : [];
      results.push({ kind: "type", name: match[1], fields, file });
    }
  }
  return results;
}

export function extractEnums(
  content: string,
  file: string,
  langAdapter: LanguageAdapter = typescriptAdapter,
): TypeEntry[] {
  const results: TypeEntry[] = [];

  // pgEnum (toujours TypeScript/Drizzle)
  const pgEnumPattern = /export\s+const\s+(\w+)\s*=\s*pgEnum\(["']\w+["'],\s*\[([^\]]+)\]/g;
  let match;
  while ((match = pgEnumPattern.exec(content)) !== null) {
    const values = match[2]
      .split(",")
      .map((v) => v.trim().replace(/['"]/g, ""))
      .filter(Boolean);
    results.push({ kind: "enum", name: match[1], fields: values, file });
  }

  // TS enum via adapter
  const tsEnumPattern = new RegExp(langAdapter.enumPattern.source, langAdapter.enumPattern.flags);
  while ((match = tsEnumPattern.exec(content)) !== null) {
    const values = match[2]
      .split(",")
      .map((v) => v.trim().split("=")[0].trim())
      .filter(Boolean);
    results.push({ kind: "enum", name: match[1], fields: values, file });
  }

  return results;
}

/** Helper interne : collecte tous les types sans sérialisation */
function collectTypes(rootDir: string, config: KlixConfig): TypeEntry[] {
  const { filePatterns } = config.indexers.types;
  const langAdapter = findLanguageAdapter(config.language) ?? typescriptAdapter;
  const allTypes: TypeEntry[] = [];
  const seen = new Set<string>();

  for (const pattern of filePatterns) {
    const files = globFiles(rootDir, pattern, config.exclude);
    for (const filePath of files) {
      let content = "";
      try {
        content = readFileSync(filePath, "utf-8");
      } catch {
        continue;
      }
      const file = relative(process.cwd(), filePath).replace(/\\/g, "/");

      allTypes.push(
        ...extractInterfaces(content, file, langAdapter),
        ...extractTypeAliases(content, file, langAdapter),
        ...extractEnums(content, file, langAdapter),
      );
    }
  }

  // Also scan schema files for enums
  const schemaFiles = globFiles(rootDir, config.indexers.dbSchema.filePattern, config.exclude);
  for (const filePath of schemaFiles) {
    let content = "";
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }
    const file = relative(process.cwd(), filePath).replace(/\\/g, "/");
    allTypes.push(...extractEnums(content, file, langAdapter));
  }

  // Deduplicate
  return allTypes.filter((t) => {
    const key = `${t.name}:${t.file}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Retourne les types groupés par domaine (premier segment significatif du chemin) */
export function runTypesIndexerGrouped(rootDir: string, config: KlixConfig): Map<string, TypeEntry[]> {
  const deduped = collectTypes(rootDir, config);
  const byDomain = new Map<string, TypeEntry[]>();
  for (const t of deduped) {
    const domain = extractDomain(t.file);
    if (!byDomain.has(domain)) byDomain.set(domain, []);
    byDomain.get(domain)!.push(t);
  }
  return byDomain;
}

/** Sérialise les types d'un domaine pour un fichier de split */
export function serializeTypesSection(domain: string, entries: TypeEntry[], config: KlixConfig): string {
  const byKind = new Map<string, TypeEntry[]>();
  for (const t of entries) {
    if (!byKind.has(t.kind)) byKind.set(t.kind, []);
    byKind.get(t.kind)!.push(t);
  }

  const lines: string[] = [
    `# TYPES/${domain} — ${config.name}`,
    ``,
    `> ${entries.length} types · domaine: ${domain}`,
    ``,
  ];

  for (const kind of ["interface", "type", "enum"] as const) {
    const group = byKind.get(kind) ?? [];
    if (!group.length) continue;

    lines.push(
      `## ${kind === "interface" ? "Interfaces" : kind === "type" ? "Type Aliases" : "Enums"} (${group.length})`,
    );
    lines.push(``);

    for (const t of group) {
      if (t.fields.length) {
        lines.push(`**\`${t.name}\`** — \`${t.file}\``);
        lines.push(`> ${t.fields.join(" · ")}`);
      } else {
        lines.push(`**\`${t.name}\`** — \`${t.file}\``);
      }
      lines.push(``);
    }
  }

  return lines.join("\n");
}

export function runTypesIndexer(rootDir: string, config: KlixConfig): string {
  const deduped = collectTypes(rootDir, config);

  // Group by kind
  const byKind = new Map<string, TypeEntry[]>();
  for (const t of deduped) {
    if (!byKind.has(t.kind)) byKind.set(t.kind, []);
    byKind.get(t.kind)!.push(t);
  }

  const lines: string[] = [`# TYPES — ${config.name}`, ``, `> ${deduped.length} types/interfaces/enums`, ``];

  for (const kind of ["interface", "type", "enum"] as const) {
    const group = byKind.get(kind) ?? [];
    if (!group.length) continue;

    lines.push(
      `## ${kind === "interface" ? "Interfaces" : kind === "type" ? "Type Aliases" : "Enums"} (${group.length})`,
    );
    lines.push(``);

    for (const t of group) {
      if (t.fields.length) {
        lines.push(`**\`${t.name}\`** — \`${t.file}\``);
        lines.push(`> ${t.fields.join(" · ")}`);
      } else {
        lines.push(`**\`${t.name}\`** — \`${t.file}\``);
      }
      lines.push(``);
    }
  }

  return lines.join("\n");
}
