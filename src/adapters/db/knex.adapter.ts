import { relative } from "path";
import type { DbAdapter, TableDef, ColumnDef } from "./_base";
import { parseSqlCreateTableBody, extractSqlParenBody } from "./raw-sql.adapter";

const IGNORED_KNEX_METHODS = new Set([
  "timestamps", "index", "unique", "foreign", "primary",
  "dropColumn", "renameColumn", "dropTimestamps",
]);

export function parseKnexColumn(line: string): ColumnDef | null {
  const match = line.match(/^\s+table\.(\w+)\(['"]([^'"]+)['"]/);
  if (!match) return null;

  const knexType = match[1];
  const name = match[2];

  if (IGNORED_KNEX_METHODS.has(knexType)) return null;

  const isAutoIncrement = knexType === "increments" || knexType === "bigincrements";
  const type = isAutoIncrement ? (knexType === "bigincrements" ? "biginteger" : "integer") : knexType;

  const isPk = isAutoIncrement || line.includes(".primary()");
  const isFk = line.includes(".references(");
  const nullable = !line.includes(".notNullable()") && !isPk;
  const hasDefault = line.includes(".defaultTo(");

  let references: string | undefined;
  if (isFk) {
    const refMatch = line.match(/\.references\(['"]([^'"]+)['"]\)\.inTable\(['"]([^'"]+)['"]\)/);
    if (refMatch) references = `${refMatch[2]}.${refMatch[1]}`;
  }

  return { name, type, nullable, hasDefault, isPk, isFk, references };
}

function extractTableBody(content: string, startIdx: number): string {
  let i = startIdx;
  while (i < content.length && content[i] !== "{") i++;
  if (i >= content.length) return "";
  let depth = 0;
  const bodyStart = i + 1;
  let bodyEnd = i + 1;
  for (; i < content.length; i++) {
    if (content[i] === "{") depth++;
    else if (content[i] === "}") { depth--; if (depth === 0) { bodyEnd = i; break; } }
  }
  return content.slice(bodyStart, bodyEnd);
}

/**
 * Extrait le corps de la fonction `exports.up` / `export function up` d'une migration Knex.
 * Si aucun pattern `up` n'est trouvé, retourne le contenu complet (fallback).
 */
export function extractUpBody(content: string): string {
  const upPattern = /(?:exports\.up\s*=|module\.exports\.up\s*=|export\s+(?:async\s+)?function\s+up|export\s+const\s+up\s*=)/;
  const match = upPattern.exec(content);
  if (!match) return content;

  let i = match.index + match[0].length;
  // Avancer jusqu'à la première accolade ouvrante du corps
  while (i < content.length && content[i] !== "{") i++;
  if (i >= content.length) return content;

  let depth = 0;
  const bodyStart = i + 1;
  for (; i < content.length; i++) {
    if (content[i] === "{") depth++;
    else if (content[i] === "}") {
      depth--;
      if (depth === 0) return content.slice(bodyStart, i);
    }
  }
  return content;
}

function extractRawSqlStrings(content: string): string[] {
  const results: string[] = [];
  // Template literals multi-lignes : .raw(`...`)
  const templateRe = /\.raw\s*\(\s*`([\s\S]*?)`\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = templateRe.exec(content)) !== null) results.push(m[1]);
  // Strings simples/doubles : .raw('...') ou .raw("...")
  const strRe = /\.raw\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = strRe.exec(content)) !== null) results.push(m[1]);
  return results;
}

export const knexAdapter: DbAdapter = {
  id: "knex",
  name: "Knex.js",
  packages: ["knex"],
  defaultFilePattern: "**/migrations/**/*.{ts,js}",

  extract(content: string, filePath: string) {
    const tables: TableDef[] = [];
    const file = relative(process.cwd(), filePath).replace(/\\/g, "/");

    const upBody = extractUpBody(content);

    const tableHeader = /\.createTable\(\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = tableHeader.exec(upBody)) !== null) {
      const tableName = match[1];
      const body = extractTableBody(upBody, match.index + match[0].length);
      const columns: ColumnDef[] = [];
      for (const line of body.split("\n")) {
        const col = parseKnexColumn(line);
        if (col) columns.push(col);
      }
      tables.push({ name: tableName, varName: tableName, columns, file });
    }

    const droppedTables: string[] = [];
    const dropPattern = /\.dropTable(?:IfExists)?\(\s*['"]([^'"]+)['"]\)/g;
    let dropMatch;
    while ((dropMatch = dropPattern.exec(upBody)) !== null) {
      droppedTables.push(dropMatch[1]);
    }

    for (const rawSql of extractRawSqlStrings(upBody)) {
      const createRaw = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:\w+\.)?(\w+)\s*\(/gi;
      let rawMatch: RegExpExecArray | null;
      while ((rawMatch = createRaw.exec(rawSql)) !== null) {
        const tableName = rawMatch[1];
        const body = extractSqlParenBody(rawSql, rawMatch.index + rawMatch[0].length - 1);
        const columns = parseSqlCreateTableBody(body);
        tables.push({ name: tableName, varName: tableName, columns, file });
      }

      const dropRaw = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:\w+\.)?(\w+)/gi;
      let dropRawMatch: RegExpExecArray | null;
      while ((dropRawMatch = dropRaw.exec(rawSql)) !== null) {
        droppedTables.push(dropRawMatch[1]);
      }
    }

    return { tables, enums: [], droppedTables };
  },
};
