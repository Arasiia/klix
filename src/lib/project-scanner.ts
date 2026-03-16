import { existsSync, readdirSync, statSync } from "fs";
import { join, extname, basename } from "path";
import { detectDbFramework } from "../adapters";
import {
  readKnexfile,
  parseKnexfileConfig,
  readDrizzleConfig,
  parseDrizzleConfig,
  detectApiPrefixFromEntryFiles,
} from "./config-parser";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface FrameworkHints {
  isNextJs?: boolean;
  isNuxt?: boolean;
  isNestJs?: boolean;
}

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
  frameworkHints?: FrameworkHints;
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
 * Primary : `src/`, `app/`, `server/`, `client/`, `lib/`
 * Secondary : `pages/`, `components/`, `middleware/`, `utils/`, `helpers/`, `shared/`
 *
 * Si au moins un primary trouvé, les secondary existants sont aussi inclus.
 * Si aucun primary, les secondary deviennent candidats principaux.
 * Si rien → `["."]`.
 */
export function detectSourceRoots(cwd: string): string[] {
  const primaryCandidates = ["src", "app", "server", "client", "lib"];
  const secondaryCandidates = ["pages", "components", "middleware", "utils", "helpers", "shared"];

  const primaryRoots: string[] = [];
  for (const dir of primaryCandidates) {
    const full = join(cwd, dir);
    if (existsSync(full) && dirHasSourceFiles(full)) {
      primaryRoots.push(dir);
    }
  }

  const secondaryRoots: string[] = [];
  for (const dir of secondaryCandidates) {
    const full = join(cwd, dir);
    if (existsSync(full) && dirHasSourceFiles(full)) {
      secondaryRoots.push(dir);
    }
  }

  if (primaryRoots.length > 0) {
    return [...primaryRoots, ...secondaryRoots];
  }

  return secondaryRoots.length > 0 ? secondaryRoots : ["."];
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
    // Framework build outputs
    "**/.next/**",
    "**/.nuxt/**",
    "**/.output/**",
    "**/.vercel/**",
    "**/.turbo/**",
    "**/.svelte-kit/**",
    "**/.astro/**",
    // Static assets
    "**/public/**",
    "**/static/**",
    // Seeds & fixtures
    "**/seed/**",
    "**/seeds/**",
    "**/fixtures/**",
    // Prisma generated migrations
    "**/prisma/migrations/**",
    // Root-level config files (no **/ → matches only at root via walker)
    "*.config.{ts,js,mjs,cjs}",
  ];

  if ("drizzle-orm" in deps) {
    patterns.push("**/drizzle/**");
  }

  if (existsSync(join(cwd, "migrations"))) {
    patterns.push("**/migrations/**");
  }

  // Knexfile seeds directory → exclude
  const knexContent = readKnexfile(cwd);
  if (knexContent) {
    const { seedsDir } = parseKnexfileConfig(knexContent);
    if (seedsDir && existsSync(join(cwd, seedsDir))) {
      patterns.push(`**/${seedsDir}/**`);
    }
  }

  return patterns;
}

/**
 * Détecte où vivent les fichiers de routes dans le projet.
 *
 * Stratégies (par ordre de priorité) :
 * 1. Dossier routes/ dans un source root → glob récursif
 * 2. Fichiers routes* au root → glob sur les fichiers route
 * 3. Dossier controllers/ → glob récursif
 * 4. Dossier api/ → glob récursif
 * 5. Dossier endpoints/ → glob récursif
 * 6. Fallback → undefined (utiliser le defaultFilePattern de l'adapter)
 *
 * Si aucun apiPrefix structurel, tente la détection depuis les fichiers d'entrée.
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

    // Strategy 4: api/ directory
    const apiDir = join(rootDir, "api");
    if (existsSync(apiDir) && statSync(apiDir).isDirectory()) {
      return { detected: true, filePattern: `${prefix}api/**/*.${ext}`, apiPrefix: "/" };
    }

    // Strategy 5: endpoints/ directory
    const endpointsDir = join(rootDir, "endpoints");
    if (existsSync(endpointsDir) && statSync(endpointsDir).isDirectory()) {
      return { detected: true, filePattern: `${prefix}endpoints/**/*.${ext}`, apiPrefix: "/" };
    }
  }

  return { detected: false };
}

/**
 * Enrichit l'apiPrefix d'un résultat de détection de routes
 * en parsant les fichiers d'entrée Express/Koa.
 */
export function enrichApiPrefix(
  cwd: string,
  roots: string[],
  routes: { detected: boolean; filePattern?: string; apiPrefix?: string },
): { detected: boolean; filePattern?: string; apiPrefix?: string } {
  if (!routes.detected) return routes;

  // Si apiPrefix déjà spécifique (pas "/"), on le garde
  if (routes.apiPrefix && routes.apiPrefix !== "/") return routes;

  const prefix = detectApiPrefixFromEntryFiles(cwd, roots);
  if (prefix) {
    return { ...routes, apiPrefix: prefix };
  }

  return routes;
}

/**
 * Détecte les fichiers de services.
 *
 * Cherche : `services/`, `middleware/`, `utils/`, `helpers/`,
 * fichiers `*.service.{ext}`, et patterns NestJS.
 */
export function detectServiceFiles(
  cwd: string,
  roots: string[],
  ext: string,
  deps?: Record<string, string>,
): string | string[] | undefined {
  const patterns: string[] = [];

  for (const root of roots) {
    const rootDir = root === "." ? cwd : join(cwd, root);
    const prefix = root === "." ? "" : `${root}/`;

    const servicesDir = join(rootDir, "services");
    if (existsSync(servicesDir) && statSync(servicesDir).isDirectory()) {
      patterns.push(`${prefix}services/**/*.${ext}`);
    }

    const middlewareDir = join(rootDir, "middleware");
    if (existsSync(middlewareDir) && statSync(middlewareDir).isDirectory()) {
      patterns.push(`${prefix}middleware/**/*.${ext}`);
    }

    const utilsDir = join(rootDir, "utils");
    if (existsSync(utilsDir) && statSync(utilsDir).isDirectory()) {
      patterns.push(`${prefix}utils/**/*.${ext}`);
    }

    const helpersDir = join(rootDir, "helpers");
    if (existsSync(helpersDir) && statSync(helpersDir).isDirectory()) {
      patterns.push(`${prefix}helpers/**/*.${ext}`);
    }
  }

  // NestJS patterns
  if (deps && "@nestjs/core" in deps) {
    patterns.push(`**/*.service.${ext}`, `**/*.controller.${ext}`);
  }

  if (patterns.length > 0) {
    return patterns.length === 1 ? patterns[0] : patterns;
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
 * - knex : parse knexfile → fallback dirs → migrations/ structurel
 * - drizzle : parse drizzle.config → db/schema/ structurel
 * - prisma : cherche prisma/schema.prisma
 * - raw-sql : cherche migrations/ avec fichiers .sql
 */
export function detectDbSchemaFiles(
  cwd: string,
  roots: string[],
  dbFramework: string,
  ext: string,
): { detected: boolean; filePattern?: string } {
  if (dbFramework === "knex") {
    // 1. Parse knexfile config
    const knexContent = readKnexfile(cwd);
    if (knexContent) {
      const { migrationsDir } = parseKnexfileConfig(knexContent);
      if (migrationsDir && existsSync(join(cwd, migrationsDir))) {
        return { detected: true, filePattern: `${migrationsDir}/**/*.${ext}` };
      }
    }

    // 2. Check root migrations/
    if (existsSync(join(cwd, "migrations"))) {
      return { detected: true, filePattern: `migrations/**/*.${ext}` };
    }

    // 3. Check inside source roots
    for (const root of roots) {
      const migrDir = root === "." ? join(cwd, "migrations") : join(cwd, root, "migrations");
      if (existsSync(migrDir)) {
        const prefix = root === "." ? "" : `${root}/`;
        return { detected: true, filePattern: `${prefix}migrations/**/*.${ext}` };
      }
    }

    // 4. Fallback: common Knex migration directories
    const knexFallbackDirs = ["db/migrations", "database/migrations", "src/db/migrations", "src/migrations"];
    for (const dir of knexFallbackDirs) {
      if (existsSync(join(cwd, dir))) {
        return { detected: true, filePattern: `${dir}/**/*.${ext}` };
      }
    }
  }

  if (dbFramework === "drizzle") {
    // 1. Parse drizzle.config
    const drizzleContent = readDrizzleConfig(cwd);
    if (drizzleContent) {
      const { schemaPath } = parseDrizzleConfig(drizzleContent);
      if (schemaPath) {
        // schemaPath could be a file or directory
        if (existsSync(join(cwd, schemaPath))) {
          const stat = statSync(join(cwd, schemaPath));
          if (stat.isDirectory()) {
            return { detected: true, filePattern: `${schemaPath}/**/*.${ext}` };
          }
          // It's a file — si c'est un barrel (index.ts/js), utiliser le répertoire parent
          const BARREL_NAMES = new Set(["index.ts", "index.js", "index.tsx", "index.jsx"]);
          if (BARREL_NAMES.has(basename(schemaPath))) {
            const lastSlash = schemaPath.lastIndexOf("/");
            if (lastSlash > 0) {
              const parentDir = schemaPath.substring(0, lastSlash);
              return { detected: true, filePattern: `${parentDir}/**/*.${ext}` };
            }
          }
          return { detected: true, filePattern: schemaPath };
        }
      }
    }

    // 2. Structural detection in source roots
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
  let routes = detectRouteFiles(cwd, sourceRoots, ext);
  const servicePattern = detectServiceFiles(cwd, sourceRoots, ext, deps);
  const typePatterns = detectTypeFiles(cwd, sourceRoots, ext);

  // Framework hints
  const frameworkHints: FrameworkHints = {};
  if ("next" in deps) frameworkHints.isNextJs = true;
  if ("nuxt" in deps) frameworkHints.isNuxt = true;
  if ("@nestjs/core" in deps) frameworkHints.isNestJs = true;

  // Next.js API routes detection
  if (frameworkHints.isNextJs && !routes.detected) {
    // Check app/api/ or pages/api/
    if (existsSync(join(cwd, "app", "api"))) {
      routes = { detected: true, filePattern: `app/api/**/*.${ext}`, apiPrefix: "/api" };
    } else if (existsSync(join(cwd, "pages", "api"))) {
      routes = { detected: true, filePattern: `pages/api/**/*.${ext}`, apiPrefix: "/api" };
    }
  }

  // Enrich apiPrefix from entry files (Express/Koa app.use())
  routes = enrichApiPrefix(cwd, sourceRoots, routes);

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

  const hasHints = frameworkHints.isNextJs || frameworkHints.isNuxt || frameworkHints.isNestJs;

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
    ...(hasHints ? { frameworkHints } : {}),
  };
}
