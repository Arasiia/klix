import { existsSync, writeFileSync, readFileSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";
import { detectFramework } from "../lib/config";
import { findRouteAdapter, findDbAdapter, findHooksAdapter } from "../adapters";
import { loadDepsFromPackageJson, isFrontendOnlyProject } from "../lib/stack-detector";
import { scanProject } from "../lib/project-scanner";

/**
 * Résout un pattern de workspace (avec ou sans glob `*`).
 * - Sans glob : vérifie l'existence du dossier
 * - Avec glob `dir/*` : lit le contenu de `dir/` et filtre par package.json
 */
function resolveWorkspacePattern(cwd: string, pattern: string): string[] {
  if (!pattern.includes("*")) {
    return existsSync(join(cwd, pattern)) ? [pattern] : [];
  }
  // Supporte uniquement `dir/*` (un seul niveau de glob)
  const slashIdx = pattern.indexOf("/*");
  if (slashIdx === -1) return [];
  const baseDir = pattern.substring(0, slashIdx);
  const basePath = join(cwd, baseDir);
  if (!existsSync(basePath)) return [];
  try {
    return readdirSync(basePath)
      .filter((name) => {
        const full = join(basePath, name);
        return statSync(full).isDirectory() && existsSync(join(full, "package.json"));
      })
      .map((name) => `${baseDir}/${name}`);
  } catch {
    return [];
  }
}

export function detectWorkspaces(cwd: string): string[] {
  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const rawWorkspaces: string[] = Array.isArray(pkg.workspaces) ? pkg.workspaces : [];
      if (rawWorkspaces.length > 0) {
        const resolved: string[] = [];
        for (const w of rawWorkspaces) {
          if (typeof w !== "string") continue;
          resolved.push(...resolveWorkspacePattern(cwd, w));
        }
        return resolved;
      }
    } catch {}
  }

  // Fallback : scanner packages/ si pas de workspaces déclarés
  return resolveWorkspacePattern(cwd, "packages/*");
}

/**
 * Détecte si le projet a une structure de dossiers profonde (3+ niveaux).
 * Retourne 2 si on trouve des sous-sous-dossiers dans les sourceRoots, sinon 1.
 */
export function detectDomainDepth(cwd: string, sourceRoots: string[]): number {
  const prefixes = ["server/src", "client/src", "src", "server", "client", "app", "lib", "utils"];

  for (const root of sourceRoots) {
    // Trouver la partie du root après le préfixe connu
    let effectiveRoot = root;
    for (const p of prefixes) {
      if (root === p || root.startsWith(p + "/")) {
        effectiveRoot = root;
        break;
      }
    }

    const rootPath = join(cwd, effectiveRoot);
    if (!existsSync(rootPath)) continue;

    try {
      const firstLevel = readdirSync(rootPath);
      for (const item of firstLevel) {
        const itemPath = join(rootPath, item);
        try {
          if (!statSync(itemPath).isDirectory()) continue;
          const secondLevel = readdirSync(itemPath);
          for (const subItem of secondLevel) {
            const subPath = join(itemPath, subItem);
            try {
              if (statSync(subPath).isDirectory()) return 2;
            } catch { continue; }
          }
        } catch { continue; }
      }
    } catch { continue; }
  }

  return 1;
}

export async function cmdInit(cwd: string) {
  const configPath = join(cwd, "klix.config.json");

  if (existsSync(configPath)) {
    console.log(`[klix] klix.config.json existe déjà dans ${cwd}`);
    return;
  }

  // Try to detect project name from package.json
  let projectName = basename(cwd);
  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.name) projectName = pkg.name;
    } catch {}
  }

  const { routes, dbSchema, hooks } = detectFramework(cwd);
  const workspaces = detectWorkspaces(cwd);
  const deps = loadDepsFromPackageJson(cwd);
  const scan = scanProject(cwd, deps);
  const domainDepth = detectDomainDepth(cwd, scan.sourceRoots);

  const routeAdapter = findRouteAdapter(routes);
  const dbAdapter = findDbAdapter(dbSchema);
  const hooksAdapter = findHooksAdapter(hooks);

  const isFrontendOnly = isFrontendOnlyProject(deps);
  const routeEnabled = !isFrontendOnly && (routes !== "none" || scan.routes.detected);
  const dbEnabled = dbSchema !== "none" || scan.dbSchema.detected;
  const hooksEnabled = hooks !== "none" || scan.hooks.detected;

  // NestJS: include controllers in service pattern if not already
  if (scan.frameworkHints?.isNestJs && scan.functions.servicePattern) {
    const sp = scan.functions.servicePattern;
    if (Array.isArray(sp) && !sp.some((p) => p.includes(".controller."))) {
      sp.push("**/*.controller.{ts,tsx}");
    }
  }

  const config = {
    version: "1",
    name: projectName,
    root: ".",
    output: ".codeindex",
    language: scan.language,
    include: scan.include,
    exclude: scan.exclude,
    indexers: {
      files: { enabled: true },
      routes: routeEnabled
        ? {
            enabled: true,
            framework: routes !== "none" ? routes : "express",
            apiPrefix: scan.routes.apiPrefix ?? "/",
            filePattern: scan.routes.filePattern ?? routeAdapter?.defaultFilePattern ?? "**/*.routes.ts",
          }
        : {
            enabled: false,
            ...(routes !== "none" ? { framework: routes } : {}),
          },
      functions: {
        enabled: true,
        includeJsDoc: true,
        servicePattern: scan.functions.servicePattern ?? "**/*.service.ts",
        excludeTsx: true,
      },
      types: {
        enabled: true,
        filePatterns: scan.types.filePatterns ?? ["**/*.api.ts", "**/*.types.ts", "**/*.store.ts"],
      },
      dbSchema: dbEnabled
        ? {
            enabled: true,
            framework: dbSchema !== "none" ? dbSchema : "knex",
            filePattern: scan.dbSchema.filePattern ?? dbAdapter?.defaultFilePattern ?? "server/src/db/schema/*.ts",
          }
        : {
            enabled: false,
            framework: dbSchema !== "none" ? dbSchema : "drizzle",
            filePattern: dbAdapter?.defaultFilePattern ?? "server/src/db/schema/*.ts",
          },
      hooks: hooksEnabled
        ? {
            enabled: true,
            filePattern: scan.hooks.filePattern ?? hooksAdapter?.defaultFilePattern ?? "**/hooks/use-*.ts",
            framework: hooks !== "none" ? hooks : "tanstack-query",
          }
        : {
            enabled: false,
            filePattern: hooksAdapter?.defaultFilePattern ?? "**/hooks/use-*.ts",
            framework: hooks !== "none" ? hooks : "tanstack-query",
          },
    },
    claude: {
      claudeMdPath: "CLAUDE.md",
      conventions: [],
    },
    ...(domainDepth > 1 ? { domainDepth } : {}),
    ...(workspaces.length > 0 ? { workspaces } : {}),
  };

  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");

  console.log(`[klix] klix.config.json créé pour "${projectName}"`);
  console.log(`  Langage          : ${scan.language}`);
  console.log(`  Sources          : ${scan.sourceRoots.join(", ")}`);
  console.log(`  Routes (${routes.padEnd(8)}) : ${routeEnabled ? (scan.routes.filePattern ?? routeAdapter?.defaultFilePattern ?? "défaut") : "désactivé"}`);
  console.log(`  DB     (${(dbSchema !== "none" ? dbSchema : "-").padEnd(8)}) : ${dbEnabled ? (scan.dbSchema.filePattern ?? "défaut") : "désactivé"}`);
  console.log(`  Hooks  (${(hooks !== "none" ? hooks : "-").padEnd(8)}) : ${hooksEnabled ? (scan.hooks.filePattern ?? "défaut") : "désactivé"}`);
  if (scan.frameworkHints) {
    const hints: string[] = [];
    if (scan.frameworkHints.isNextJs) hints.push("Next.js");
    if (scan.frameworkHints.isNuxt) hints.push("Nuxt");
    if (scan.frameworkHints.isNestJs) hints.push("NestJS");
    if (hints.length > 0) console.log(`  Frameworks      : ${hints.join(", ")}`);
  }
  if (workspaces.length > 0) {
    console.log(`  Workspaces détectés : ${workspaces.join(", ")}`);
  }
  console.log(`\nProchaine étape : klix index`);
}
