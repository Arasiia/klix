import { relative } from "path";
import type { DbAdapter, TableDef, EnumDef, ColumnDef } from "./_base";

/**
 * Parse une ligne de colonne Drizzle ORM.
 * Exported pour les tests et l'usage externe.
 */
export function parseDrizzleColumn(line: string): ColumnDef | null {
  const nameMatch = line.match(/^\s+(\w+):\s+(\w+)\(/);
  if (!nameMatch) return null;

  const name = nameMatch[1];
  const type = nameMatch[2];
  const isPk = line.includes(".primaryKey()");
  const isFk = line.includes(".references(");
  const nullable = !line.includes(".notNull()") && !isPk;
  const hasDefault = line.includes(".default") || line.includes(".defaultRandom") || line.includes(".defaultNow");

  let references: string | undefined;
  if (isFk) {
    const refMatch = line.match(/\.references\(\(\)\s*=>\s*(\w+)\.(\w+)/);
    if (refMatch) references = `${refMatch[1]}.${refMatch[2]}`;
  }

  return { name, type, nullable, hasDefault, isPk, isFk, references };
}

function extractTableBody(content: string, startIdx: number): string {
  let i = startIdx;
  while (i < content.length && content[i] !== "{") i++;
  if (i >= content.length) return "";

  let depth = 0;
  let bodyStart = i + 1;
  let bodyEnd = i + 1;

  for (; i < content.length; i++) {
    if (content[i] === "{") depth++;
    else if (content[i] === "}") {
      depth--;
      if (depth === 0) {
        bodyEnd = i;
        break;
      }
    }
  }

  return content.slice(bodyStart, bodyEnd);
}

export const drizzleAdapter: DbAdapter = {
  id: "drizzle",
  name: "Drizzle ORM",
  packages: ["drizzle-orm"],
  defaultFilePattern: "server/src/db/schema/*.ts",

  extract(content: string, filePath: string): { tables: TableDef[]; enums: EnumDef[] } {
    const tables: TableDef[] = [];
    const enums: EnumDef[] = [];
    const file = relative(process.cwd(), filePath).replace(/\\/g, "/");

    // Extract enums
    const enumPattern = /export\s+const\s+(\w+)\s*=\s*pgEnum\(["'][^"']+["'],\s*\[([^\]]+)\]/g;
    let match;
    while ((match = enumPattern.exec(content)) !== null) {
      const values = match[2]
        .split(",")
        .map((v) => v.trim().replace(/['"]/g, ""))
        .filter(Boolean);
      enums.push({ name: match[1], values });
    }

    // Extract tables using bracket-counting
    const tableHeader = /export\s+const\s+(\w+)\s*=\s*pgTable\(["']([^"']+)["']/g;
    while ((match = tableHeader.exec(content)) !== null) {
      const varName = match[1];
      const tableName = match[2];
      const body = extractTableBody(content, match.index + match[0].length);

      const columns: ColumnDef[] = [];
      const colPattern = /^\s{2}(\w+):\s+(\w+)\(([^)]*)\)([\s\S]*?)(?=,\n\s{2}\w+:|$)/gm;
      let cm;
      while ((cm = colPattern.exec(body)) !== null) {
        const name = cm[1];
        const type = cm[2];
        const fullCol = cm[0];

        const isPk = fullCol.includes(".primaryKey()");
        const isFk = fullCol.includes(".references(");
        const nullable = !fullCol.includes(".notNull()") && !isPk;
        const hasDefault =
          fullCol.includes(".default") || fullCol.includes(".defaultRandom") || fullCol.includes(".defaultNow");

        let references: string | undefined;
        if (isFk) {
          const refMatch = fullCol.match(/\.references\(\(\)\s*=>\s*(\w+)\.(\w+)/);
          if (refMatch) references = `${refMatch[1]}.${refMatch[2]}`;
        }

        columns.push({ name, type, nullable, hasDefault, isPk, isFk, references });
      }

      tables.push({ name: tableName, varName, columns, file });
    }

    return { tables, enums };
  },
};
