import { existsSync, readFileSync } from "fs";
import { join } from "path";

/* ------------------------------------------------------------------ */
/*  Knexfile parsing                                                    */
/* ------------------------------------------------------------------ */

/**
 * Extrait les chemins migrations et seeds depuis le contenu d'un knexfile.
 *
 * Supporte :
 * - `directory: './path'` (string literal)
 * - `directory: path.join(__dirname, 'path')` (path.join)
 */
export function parseKnexfileConfig(content: string): {
  migrationsDir?: string;
  seedsDir?: string;
} {
  const result: { migrationsDir?: string; seedsDir?: string } = {};

  // Extract migrations directory
  const migrBlock = content.match(/migrations\s*:\s*\{([^}]+)\}/s);
  if (migrBlock) {
    const dir = extractDirectory(migrBlock[1]);
    if (dir) result.migrationsDir = normalizeDir(dir);
  }

  // Extract seeds directory
  const seedsBlock = content.match(/seeds\s*:\s*\{([^}]+)\}/s);
  if (seedsBlock) {
    const dir = extractDirectory(seedsBlock[1]);
    if (dir) result.seedsDir = normalizeDir(dir);
  }

  return result;
}

function extractDirectory(block: string): string | undefined {
  // String literal: directory: './migrations' or directory: 'migrations'
  const literal = block.match(/directory\s*:\s*['"]([^'"]+)['"]/);
  if (literal) return literal[1];

  // path.join: directory: path.join(__dirname, 'migrations')
  const pathJoin = block.match(/directory\s*:\s*path\.join\([^,]+,\s*['"]([^'"]+)['"]\)/);
  if (pathJoin) return pathJoin[1];

  return undefined;
}

/** Normalise `./foo/bar` → `foo/bar` */
function normalizeDir(dir: string): string {
  return dir.replace(/^\.\//, "");
}

/* ------------------------------------------------------------------ */
/*  Drizzle config parsing                                              */
/* ------------------------------------------------------------------ */

/**
 * Extrait le chemin du schéma depuis un drizzle.config.{ts,js}.
 */
export function parseDrizzleConfig(content: string): { schemaPath?: string } {
  // schema: './src/db/schema' or schema: 'src/db/schema.ts'
  const match = content.match(/schema\s*:\s*['"]([^'"]+)['"]/);
  if (match) return { schemaPath: normalizeDir(match[1]) };

  // schema: ['./src/db/schema/users.ts', ...]
  const arrayMatch = content.match(/schema\s*:\s*\[([^\]]+)\]/);
  if (arrayMatch) {
    const first = arrayMatch[1].match(/['"]([^'"]+)['"]/);
    if (first) return { schemaPath: normalizeDir(first[1]) };
  }

  return {};
}

/* ------------------------------------------------------------------ */
/*  API prefix parsing                                                  */
/* ------------------------------------------------------------------ */

/**
 * Extrait le prefix API depuis un fichier d'entrée Express/Koa.
 *
 * Cherche : `app.use('/api', ...)` ou `app.use('/api/v1', ...)`
 */
export function parseApiPrefix(content: string): string | undefined {
  const match = content.match(/app\.use\(\s*['"](\/[^'"]*)['"]\s*,/);
  if (match) return match[1];
  return undefined;
}

/* ------------------------------------------------------------------ */
/*  File finders                                                        */
/* ------------------------------------------------------------------ */

const CONFIG_EXTS = ["ts", "js", "mjs", "cjs"];

/**
 * Cherche un fichier knexfile.{ts,js,mjs,cjs} dans cwd et retourne son contenu.
 */
export function readKnexfile(cwd: string): string | undefined {
  for (const ext of CONFIG_EXTS) {
    const p = join(cwd, `knexfile.${ext}`);
    if (existsSync(p)) {
      try {
        return readFileSync(p, "utf-8");
      } catch {
        continue;
      }
    }
  }
  return undefined;
}

/**
 * Cherche drizzle.config.{ts,js} dans cwd et retourne son contenu.
 */
export function readDrizzleConfig(cwd: string): string | undefined {
  for (const ext of ["ts", "js"]) {
    const p = join(cwd, `drizzle.config.${ext}`);
    if (existsSync(p)) {
      try {
        return readFileSync(p, "utf-8");
      } catch {
        continue;
      }
    }
  }
  return undefined;
}

/**
 * Lit les fichiers d'entrée courants dans un répertoire et cherche un apiPrefix.
 */
export function detectApiPrefixFromEntryFiles(
  cwd: string,
  roots: string[],
): string | undefined {
  const entryNames = ["index.ts", "index.js", "app.ts", "app.js", "server.ts", "server.js", "main.ts", "main.js"];

  for (const root of roots) {
    const rootDir = root === "." ? cwd : join(cwd, root);
    for (const name of entryNames) {
      const p = join(rootDir, name);
      if (existsSync(p)) {
        try {
          const content = readFileSync(p, "utf-8");
          const prefix = parseApiPrefix(content);
          if (prefix) return prefix;
        } catch {
          continue;
        }
      }
    }
  }

  return undefined;
}
