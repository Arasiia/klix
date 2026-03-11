import { existsSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";
import { detectDbFramework } from "../adapters";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ProjectScan {
  language: "typescript" | "javascript";
  sourceRoots: string[];
  include: string[];
  exclude: string[];
  routes: { detected: boolean; filePattern?: string; apiPrefix?: string };
  functions: { servicePattern?: string | string[] };
  types: { filePatterns?: string[] };
  dbSchema: { detected: boolean; filePattern?: string };
  hooks: { detected: boolean; filePattern?: string };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);

/**
 * Scan BFS rapide d'un répertoire, retourne les chemins relatifs
 * des fichiers jusqu'à `maxDepth` niveaux de profondeur.
 */
export function shallowFileList(dir: string, maxDepth = 2): string[] {
  const results: string[] = [];
  const queue: Array<{ path: string; depth: number }> = [{ path: dir, depth: 0 }];

  while (queue.length > 0) {
    const { path: current, depth } = queue.shift()!;
    if (depth > maxDepth) continue;

    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry === "node_modules" || entry === ".git" || entry === "dist" || entry === "build") continue;
      const full = join(current, entry);
      try {
        const st = statSync(full);
        if (st.isDirectory()) {
          if (depth < maxDepth) queue.push({ path: full, depth: depth + 1 });
        } else {
          results.push(full.slice(dir.length + 1));
        }
      } catch {
        continue;
      }
    }
  }

  return results;
}

/**
 * Retourne le glob d'extensions selon le langage détecté.
 * Projet mixte (tsconfig + majorité JS) → inclut les deux.
 */
export function extGlob(lang: "typescript" | "javascript", hasTsConfig: boolean): string {
  if (lang === "typescript" && hasTsConfig) return "{ts,tsx}";
  if (lang === "javascript" && !hasTsConfig) return "{js,jsx}";
  // Projet mixte
  return "{ts,tsx,js,jsx}";
}

/**
 * Vérifie qu'un dossier contient au moins un fichier source.
 */
export function dirHasSourceFiles(dir: string, extensions: Set<string> = SOURCE_EXTS): boolean {
  if (!existsSync(dir)) return false;
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const full = join(dir, entry);
      try {
        if (statSync(full).isFile() && extensions.has(extname(entry))) return true;
      } catch {
        continue;
      }
    }
    // Check one level deeper
    for (const entry of entries) {
      const sub = join(dir, entry);
      try {
        if (!statSync(sub).isDirectory()) continue;
        const subEntries = readdirSync(sub);
        for (const se of subEntries) {
          if (extensions.has(extname(se))) {
            try {
              if (statSync(join(sub, se)).isFile()) return true;
            } catch {
              continue;
            }
          }
        }
      } catch {
        continue;
      }
    }
  } catch {
    return false;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/*  Détections unitaires                                               */
/* ------------------------------------------------------------------ */

/**
 * Détecte le langage principal du projet.
 *
 * Heuristiques :
 * 1. `tsconfig.json` existe → `"typescript"`
 * 2. Sinon, ratio .ts/.js sur 2 niveaux de profondeur
 * 3. Fallback → `"typescript"`
 */
export function detectLanguage(cwd: string): { language: "typescript" | "javascript"; hasTsConfig: boolean; isMixed: boolean } {
  const hasTsConfig = existsSync(join(cwd, "tsconfig.json"));

  const files = shallowFileList(cwd, 2);
  let tsCount = 0;
  let jsCount = 0;
  for (const f of files) {
    const ext = extname(f);
    if (ext === ".ts" || ext === ".tsx") tsCount++;
    else if (ext === ".js" || ext === ".jsx") jsCount++;
  }

  const total = tsCount + jsCount;
  if (total === 0) return { language: "typescript", hasTsConfig, isMixed: false };

  if (hasTsConfig) {
    // TS project, but if majority JS → mixed
    const isMixed = jsCount > tsCount;
    return { language: "typescript", hasTsConfig, isMixed };
  }

  // No tsconfig: majority wins
  const language = tsCount >= jsCount ? "typescript" : "javascript";
  return { language, hasTsConfig, isMixed: false };
}

/**
 * Détecte les dossiers racines contenant du code source.
 *
 * Vérifie l'existence de `src/`, `app/`, `server/`, `client/`, `lib/`
 * et confirme qu'ils contiennent au moins un fichier source.
 * Si aucun dossier n'est trouvé → `["."]`.
 */
export function detectSourceRoots(cwd: string): string[] {
  const candidates = ["src", "app", "server", "client", "lib"];
  const roots: string[] = [];

  for (const dir of candidates) {
    const full = join(cwd, dir);
    if (existsSync(full) && dirHasSourceFiles(full)) {
      roots.push(dir);
    }
  }

  return roots.length > 0 ? roots : ["."];
}

/**
 * Construit les patterns d'inclusion pour chaque source root.
 */
export function buildIncludePatterns(roots: string[], lang: "typescript" | "javascript", hasTsConfig: boolean, isMixed: boolean): string[] {
  const patterns: string[] = [];

  // Determine extensions to include
  let exts: string[];
  if (isMixed || (lang === "typescript" && !hasTsConfig)) {
    exts = ["ts", "tsx", "js", "jsx"];
  } else if (lang === "typescript") {
    exts = ["ts", "tsx"];
  } else {
    exts = ["js", "jsx"];
  }

  for (const root of roots) {
    const prefix = root === "." ? "" : `${root}/`;
    for (const ext of exts) {
      patterns.push(`${prefix}**/*.${ext}`);
    }
  }

  return patterns;
}

/**
 * Construit les patterns d'exclusion.
 *
 * Base minimale toujours présente + ajouts conditionnels
 * selon les dépendances et la structure du projet.
 */
export function buildExcludePatterns(cwd: string, deps: Record<string, string>): string[] {
  const patterns = [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.git/**",
    "**/coverage/**",
    "**/*.d.ts",
    "**/*.gen.ts",
    "**/__tests__/**",
    "**/*.test.{ts,js}",
    "**/*.spec.{ts,js}",
  ];

  if ("drizzle-orm" in deps) {
    patterns.push("**/drizzle/**");
  }

  if (existsSync(join(cwd, "migrations"))) {
    patterns.push("**/migrations/**");
  }

  return patterns;
}

/**
 * Détecte où vivent les fichiers de routes dans le projet.
 *
 * Stratégies (par ordre de priorité) :
 * 1. Dossier routes/ dans un source root → glob récursif (couvre les sous-dossiers)
 * 2. Fichiers routes* au root → glob sur les fichiers route
 * 3. Dossier controllers/ → glob récursif
 * 4. Fallback → undefined (utiliser le defaultFilePattern de l'adapter)
 */
export function detectRouteFiles(
  cwd: string,
  roots: string[],
  ext: string,
): { detected: boolean; filePattern?: string; apiPrefix?: string } {
  for (const root of roots) {
    const rootDir = root === "." ? cwd : join(cwd, root);
    const prefix = root === "." ? "" : `${root}/`;

    // Strategy 1: routes/ directory
    const routesDir = join(rootDir, "routes");
    if (existsSync(routesDir) && statSync(routesDir).isDirectory()) {
      const apiPrefix = existsSync(join(routesDir, "api")) ? "/api" : "/";
      return { detected: true, filePattern: `${prefix}routes/**/*.${ext}`, apiPrefix };
    }

    // Strategy 2: route files at root level (routes.js, routes-v2.js, etc.)
    try {
      const entries = readdirSync(rootDir);
      const routeFiles = entries.filter((e) => {
        const name = e.replace(extname(e), "");
        return name.startsWith("routes") && SOURCE_EXTS.has(extname(e));
      });
      if (routeFiles.length > 0) {
        return { detected: true, filePattern: `${prefix}routes*.${ext}`, apiPrefix: "/" };
      }
    } catch {}

    // Strategy 3: controllers/ directory
    const controllersDir = join(rootDir, "controllers");
    if (existsSync(controllersDir) && statSync(controllersDir).isDirectory()) {
      return { detected: true, filePattern: `${prefix}controllers/**/*.${ext}`, apiPrefix: "/" };
    }
  }

  return { detected: false };
}

/**
 * Détecte les fichiers de services.
 *
 * Cherche un dossier `{root}/services/` ou des fichiers `*.service.{ext}`.
 */
export function detectServiceFiles(
  cwd: string,
  roots: string[],
  ext: string,
): string | string[] | undefined {
  for (const root of roots) {
    const rootDir = root === "." ? cwd : join(cwd, root);
    const prefix = root === "." ? "" : `${root}/`;

    const servicesDir = join(rootDir, "services");
    if (existsSync(servicesDir) && statSync(servicesDir).isDirectory()) {
      return `${prefix}services/**/*.${ext}`;
    }
  }

  // Check for *.service.{ext} files
  const files = shallowFileList(cwd, 2);
  const serviceFiles = files.filter((f) => f.includes(".service."));
  if (serviceFiles.length > 0) {
    return `**/*.service.${ext}`;
  }

  return undefined;
}

/**
 * Détecte les fichiers de types.
 *
 * Cherche un dossier `{root}/types/` et des patterns conventionnels
 * (*.types.ts, *.api.ts, *.store.ts).
 */
export function detectTypeFiles(
  cwd: string,
  roots: string[],
  ext: string,
): string[] | undefined {
  const patterns: string[] = [];

  for (const root of roots) {
    const rootDir = root === "." ? cwd : join(cwd, root);
    const prefix = root === "." ? "" : `${root}/`;

    const typesDir = join(rootDir, "types");
    if (existsSync(typesDir) && statSync(typesDir).isDirectory()) {
      patterns.push(`${prefix}types/**/*.${ext}`);
    }
  }

  // Check for conventional type file patterns
  const files = shallowFileList(cwd, 2);
  const hasApiTypes = files.some((f) => f.includes(".api."));
  const hasTypeFiles = files.some((f) => f.includes(".types."));
  const hasStoreFiles = files.some((f) => f.includes(".store."));

  if (hasApiTypes) patterns.push(`**/*.api.${ext}`);
  if (hasTypeFiles) patterns.push(`**/*.types.${ext}`);
  if (hasStoreFiles) patterns.push(`**/*.store.${ext}`);

  return patterns.length > 0 ? patterns : undefined;
}

/**
 * Détecte les fichiers de schéma DB.
 *
 * Stratégies selon le framework :
 * - knex : cherche un dossier migrations/
 * - drizzle : cherche db/schema/ dans les source roots
 * - prisma : cherche prisma/schema.prisma
 */
export function detectDbSchemaFiles(
  cwd: string,
  roots: string[],
  dbFramework: string,
  ext: string,
): { detected: boolean; filePattern?: string } {
  if (dbFramework === "knex") {
    if (existsSync(join(cwd, "migrations"))) {
      return { detected: true, filePattern: `migrations/**/*.${ext}` };
    }
    // Check inside source roots
    for (const root of roots) {
      const migrDir = root === "." ? join(cwd, "migrations") : join(cwd, root, "migrations");
      if (existsSync(migrDir)) {
        const prefix = root === "." ? "" : `${root}/`;
        return { detected: true, filePattern: `${prefix}migrations/**/*.${ext}` };
      }
    }
  }

  if (dbFramework === "drizzle") {
    for (const root of roots) {
      const rootDir = root === "." ? cwd : join(cwd, root);
      const prefix = root === "." ? "" : `${root}/`;
      const schemaDir = join(rootDir, "db", "schema");
      if (existsSync(schemaDir)) {
        return { detected: true, filePattern: `${prefix}db/schema/*.${ext}` };
      }
    }
    // Common drizzle locations
    if (existsSync(join(cwd, "server", "src", "db", "schema"))) {
      return { detected: true, filePattern: "server/src/db/schema/*.ts" };
    }
  }

  if (dbFramework === "prisma") {
    if (existsSync(join(cwd, "prisma", "schema.prisma"))) {
      return { detected: true, filePattern: "prisma/schema.prisma" };
    }
  }

  if (dbFramework === "raw-sql") {
    if (existsSync(join(cwd, "migrations"))) {
      return { detected: true, filePattern: "migrations/**/*.sql" };
    }
    for (const root of roots) {
      const migrDir = root === "." ? join(cwd, "migrations") : join(cwd, root, "migrations");
      if (existsSync(migrDir)) {
        const prefix = root === "." ? "" : `${root}/`;
        return { detected: true, filePattern: `${prefix}migrations/**/*.sql` };
      }
    }
  }

  return { detected: false };
}

/**
 * Détecte les fichiers de hooks (React hooks, composables Vue).
 *
 * Cherche `{root}/hooks/` ou `{root}/composables/`.
 */
export function detectHookFiles(
  cwd: string,
  roots: string[],
): { detected: boolean; filePattern?: string } {
  for (const root of roots) {
    const rootDir = root === "." ? cwd : join(cwd, root);
    const prefix = root === "." ? "" : `${root}/`;

    const hooksDir = join(rootDir, "hooks");
    if (existsSync(hooksDir) && statSync(hooksDir).isDirectory()) {
      return { detected: true, filePattern: `${prefix}hooks/**/*.{ts,tsx,js,jsx}` };
    }

    const composablesDir = join(rootDir, "composables");
    if (existsSync(composablesDir) && statSync(composablesDir).isDirectory()) {
      return { detected: true, filePattern: `${prefix}composables/**/*.{ts,js}` };
    }
  }

  return { detected: false };
}

/* ------------------------------------------------------------------ */
/*  Fonction principale                                                */
/* ------------------------------------------------------------------ */

/**
 * Scanne le projet pour détecter sa structure et produire une config adaptée.
 *
 * Orchestre toutes les détections unitaires : langage, source roots,
 * patterns d'inclusion/exclusion, routes, services, types, DB, hooks.
 */
export function scanProject(cwd: string, deps: Record<string, string>): ProjectScan {
  const { language, hasTsConfig, isMixed } = detectLanguage(cwd);
  const sourceRoots = detectSourceRoots(cwd);
  const include = buildIncludePatterns(sourceRoots, language, hasTsConfig, isMixed);
  const exclude = buildExcludePatterns(cwd, deps);

  const ext = extGlob(language, hasTsConfig);
  const routes = detectRouteFiles(cwd, sourceRoots, ext);
  const servicePattern = detectServiceFiles(cwd, sourceRoots, ext);
  const typePatterns = detectTypeFiles(cwd, sourceRoots, ext);

  // Detect DB framework from deps (via adapter registry)
  let dbFramework = detectDbFramework(deps);

  // raw-sql : détection par fichiers (packages: [])
  if (dbFramework === "none") {
    const migrationsRoot = join(cwd, "migrations");
    if (existsSync(migrationsRoot)) {
      try {
        const hasSqlFiles = readdirSync(migrationsRoot).some((f) => f.endsWith(".sql"));
        if (hasSqlFiles) dbFramework = "raw-sql";
      } catch {}
    }
  }

  // prisma : pas d'adapter klix, mais on peut détecter le fichier de schéma
  if (dbFramework === "none" && "@prisma/client" in deps) dbFramework = "prisma";

  const dbSchema = detectDbSchemaFiles(cwd, sourceRoots, dbFramework, ext);
  const hooks = detectHookFiles(cwd, sourceRoots);

  return {
    language,
    sourceRoots,
    include,
    exclude,
    routes,
    functions: { servicePattern },
    types: { filePatterns: typePatterns },
    dbSchema,
    hooks,
  };
}
