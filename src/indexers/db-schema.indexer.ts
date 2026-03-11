import { readFileSync } from "fs";
import { globFiles } from "../lib/walker";
import type { KlixConfig } from "../lib/config";
import { findDbAdapter } from "../adapters";
import { drizzleAdapter, parseDrizzleColumn as _parseDrizzleColumn } from "../adapters/db/drizzle.adapter";
import type { TableDef, EnumDef, ColumnDef } from "../adapters";
import { extractDomain } from "../lib/domain-splitter";

export type { ColumnDef, TableDef, EnumDef };

/** @deprecated Utiliser drizzleAdapter depuis src/adapters/db/drizzle.adapter.ts */
export function parseDrizzleColumn(line: string): ColumnDef | null {
  return _parseDrizzleColumn(line);
}

/** @deprecated Utiliser drizzleAdapter.extract() depuis src/adapters/db/drizzle.adapter.ts */
export function extractDrizzleTables(content: string, filePath: string): { tables: TableDef[]; enums: EnumDef[] } {
  return drizzleAdapter.extract(content, filePath);
}

interface DbDomainData {
  tables: TableDef[];
  enums: EnumDef[];
}

/** Helper interne : collecte toutes les tables et enums avec info de fichier */
function collectDbSchema(
  rootDir: string,
  config: KlixConfig,
): { allTables: TableDef[]; allEnums: Array<EnumDef & { file: string }> } | null {
  const { framework, filePattern } = config.indexers.dbSchema;
  const adapter = findDbAdapter(framework);
  if (!adapter) return null;

  const files = globFiles(rootDir, filePattern, config.exclude);
  const allEnums: Array<EnumDef & { file: string }> = [];

  const tableMap = new Map<string, TableDef>();

  for (const filePath of files) {
    let content = "";
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }
    const { tables, enums, droppedTables } = adapter.extract(content, filePath);

    // Drops avant creates : gère le pattern "drop old + create new" dans un même fichier
    if (droppedTables) {
      for (const name of droppedTables) {
        tableMap.delete(name);
      }
    }
    for (const table of tables) {
      tableMap.set(table.name, table);
    }

    // Attach file info to enums using the first table's file or derive from filePath
    const fileRef = tables[0]?.file ?? filePath;
    allEnums.push(...enums.map((e) => ({ ...e, file: fileRef })));
  }

  const allTables = Array.from(tableMap.values());
  return { allTables, allEnums };
}

/** Retourne le schéma groupé par domaine (premier segment significatif du chemin des fichiers source) */
export function runDbSchemaIndexerGrouped(rootDir: string, config: KlixConfig): Map<string, DbDomainData> {
  const result = collectDbSchema(rootDir, config);
  if (!result) return new Map();

  const { allTables, allEnums } = result;
  const byDomain = new Map<string, DbDomainData>();

  const ensure = (domain: string) => {
    if (!byDomain.has(domain)) byDomain.set(domain, { tables: [], enums: [] });
    return byDomain.get(domain)!;
  };

  for (const table of allTables) {
    ensure(extractDomain(table.file)).tables.push(table);
  }
  for (const e of allEnums) {
    ensure(extractDomain(e.file)).enums.push(e);
  }

  return byDomain;
}

/** Sérialise le schéma d'un domaine pour un fichier de split */
export function serializeDbSchemaSection(domain: string, data: DbDomainData, config: KlixConfig): string {
  const { framework } = config.indexers.dbSchema;
  const lines: string[] = [
    `# DB_SCHEMA/${domain} — ${config.name}`,
    ``,
    `> ${data.tables.length} tables · domaine: ${domain} · framework: ${framework}`,
    ``,
  ];

  if (data.enums.length) {
    lines.push(`## Enums`);
    for (const e of data.enums) {
      lines.push(`- **\`${e.name}\`**: ${e.values.join(" | ")}`);
    }
    lines.push(``);
  }

  lines.push(`## Tables`);
  lines.push(``);

  for (const table of data.tables) {
    lines.push(`### \`${table.name}\` (var: \`${table.varName}\`)`);
    lines.push(`| Colonne | Type | Nullable | FK |`);
    lines.push(`|---------|------|----------|----|`);

    for (const col of table.columns) {
      const pkMark = col.isPk ? " 🔑" : "";
      const nullable = col.nullable ? "✓" : "✗";
      const fk = col.references ? `→ ${col.references}` : "—";
      lines.push(`| \`${col.name}${pkMark}\` | \`${col.type}\` | ${nullable} | ${fk} |`);
    }

    lines.push(``);
  }

  return lines.join("\n");
}

export function runDbSchemaIndexer(rootDir: string, config: KlixConfig): string {
  const { framework } = config.indexers.dbSchema;
  const adapter = findDbAdapter(framework);

  if (!adapter) {
    console.warn(`[klix] dbSchema: framework inconnu "${framework}". Adaptateurs disponibles : drizzle`);
    return `# DB SCHEMA — ${config.name}\n\n> framework "${framework}" non supporté.\n`;
  }

  const result = collectDbSchema(rootDir, config);
  const allTables = result?.allTables ?? [];
  const allEnums = result?.allEnums ?? [];

  const lines: string[] = [
    `# DB SCHEMA — ${config.name}`,
    ``,
    `> ${allTables.length} tables · framework: ${framework}`,
    ``,
  ];

  if (allEnums.length) {
    lines.push(`## Enums`);
    for (const e of allEnums) {
      lines.push(`- **\`${e.name}\`**: ${e.values.join(" | ")}`);
    }
    lines.push(``);
  }

  lines.push(`## Tables`);
  lines.push(``);

  for (const table of allTables) {
    lines.push(`### \`${table.name}\` (var: \`${table.varName}\`)`);
    lines.push(`| Colonne | Type | Nullable | FK |`);
    lines.push(`|---------|------|----------|----|`);

    for (const col of table.columns) {
      const pkMark = col.isPk ? " 🔑" : "";
      const nullable = col.nullable ? "✓" : "✗";
      const fk = col.references ? `→ ${col.references}` : "—";
      lines.push(`| \`${col.name}${pkMark}\` | \`${col.type}\` | ${nullable} | ${fk} |`);
    }

    lines.push(``);
  }

  return lines.join("\n");
}
