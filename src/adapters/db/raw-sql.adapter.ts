import { relative } from "path";
import type { DbAdapter, TableDef, ColumnDef, EnumDef } from "./_base";

const IGNORED_DDL_PREFIXES = [
  /^\s*CONSTRAINT\b/i,
  /^\s*PRIMARY\s+KEY\s*\(/i,
  /^\s*FOREIGN\s+KEY\b/i,
  /^\s*UNIQUE\b/i,
  /^\s*INDEX\b/i,
  /^\s*CHECK\b/i,
];

function stripSqlComments(sql: string): string {
  // Retire /* ... */ puis -- jusqu'à fin de ligne
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, "");
}

/**
 * Extrait le contenu entre la première `(` à partir de startIdx
 * et la parenthèse fermante correspondante.
 */
export function extractSqlParenBody(content: string, startIdx: number): string {
  let i = startIdx;
  while (i < content.length && content[i] !== "(") i++;
  if (i >= content.length) return "";
  let depth = 0;
  const bodyStart = i + 1;
  let bodyEnd = i + 1;
  for (; i < content.length; i++) {
    if (content[i] === "(") depth++;
    else if (content[i] === ")") {
      depth--;
      if (depth === 0) { bodyEnd = i; break; }
    }
  }
  return content.slice(bodyStart, bodyEnd);
}

/**
 * Parse une ligne de colonne DDL SQL.
 * Retourne null pour les lignes de contraintes ou les lignes vides.
 */
export function parseSqlColumn(line: string): ColumnDef | null {
  if (!line.trim()) return null;

  for (const pattern of IGNORED_DDL_PREFIXES) {
    if (pattern.test(line)) return null;
  }

  const match = line.match(/^\s+(\w+)\s+(\w+(?:\([^)]*\))?)/);
  if (!match) return null;

  const name = match[1];
  // Normalise le type : lowercase + strip des paramètres entre parenthèses
  const rawType = match[2];
  const type = rawType.replace(/\([^)]*\)/, "").toLowerCase();

  const isPk = /\bPRIMARY\s+KEY\b/i.test(line) || /\bSERIAL\b/i.test(rawType);
  const nullable = !isPk && !/\bNOT\s+NULL\b/i.test(line);
  const hasDefault = /\bDEFAULT\b/i.test(line);

  const isFk = /\bREFERENCES\b/i.test(line);
  let references: string | undefined;
  if (isFk) {
    const refMatch = line.match(/REFERENCES\s+(?:\w+\.)?(\w+)\s*\((\w+)\)/i);
    if (refMatch) references = `${refMatch[1]}.${refMatch[2]}`;
  }

  return { name, type, nullable, hasDefault, isPk, isFk, references };
}

/**
 * Parse le corps d'un CREATE TABLE (contenu entre les parenthèses externes).
 */
export function parseSqlCreateTableBody(body: string): ColumnDef[] {
  const columns: ColumnDef[] = [];
  for (const line of body.split(",")) {
    const col = parseSqlColumn(line);
    if (col) columns.push(col);
  }
  return columns;
}

export const rawSqlAdapter: DbAdapter = {
  id: "raw-sql",
  name: "Raw SQL / Flyway / node-pg-migrate / db-migrate",
  packages: [],
  defaultFilePattern: "**/migrations/**/*.sql",

  extract(content: string, filePath: string) {
    const sql = stripSqlComments(content);
    const file = relative(process.cwd(), filePath).replace(/\\/g, "/");

    const tables: TableDef[] = [];
    const enums: EnumDef[] = [];
    const droppedTables: string[] = [];

    // CREATE TABLE [IF NOT EXISTS] [schema.]name (
    const createPattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:\w+\.)?(\w+)\s*\(/gi;
    let match: RegExpExecArray | null;
    while ((match = createPattern.exec(sql)) !== null) {
      const tableName = match[1];
      const body = extractSqlParenBody(sql, match.index + match[0].length - 1);
      const columns = parseSqlCreateTableBody(body);
      tables.push({ name: tableName, varName: tableName, columns, file });
    }

    // DROP TABLE [IF EXISTS] [schema.]name
    const dropPattern = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:\w+\.)?(\w+)/gi;
    let dropMatch: RegExpExecArray | null;
    while ((dropMatch = dropPattern.exec(sql)) !== null) {
      droppedTables.push(dropMatch[1]);
    }

    // CREATE TYPE name AS ENUM ('val1', ...)
    const enumPattern = /CREATE\s+TYPE\s+(\w+)\s+AS\s+ENUM\s*\(([^)]+)\)/gi;
    let enumMatch: RegExpExecArray | null;
    while ((enumMatch = enumPattern.exec(sql)) !== null) {
      const enumName = enumMatch[1];
      const values = enumMatch[2]
        .split(",")
        .map((v) => v.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
      enums.push({ name: enumName, values });
    }

    return { tables, enums, droppedTables };
  },
};
