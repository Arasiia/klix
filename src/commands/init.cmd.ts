import { existsSync, writeFileSync, readFileSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";
import { detectFramework } from "../lib/config";
import { findRouteAdapter, findDbAdapter, findHooksAdapter } from "../adapters";
import { loadDepsFromPackageJson } from "../lib/stack-detector";
import { scanProject } from "../lib/project-scanner";

function detectWorkspaces(cwd: string): string[] {
  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (Array.isArray(pkg.workspaces) && pkg.workspaces.every((w: any) => typeof w === "string" && !w.includes("*"))) {
        return pkg.workspaces.filter((w: string) => existsSync(join(cwd, w)));
      }
    } catch {}
  }

  const packagesDir = join(cwd, "packages");
  if (existsSync(packagesDir)) {
    try {
      return readdirSync(packagesDir)
        .filter((name) => {
          const subPkg = join(packagesDir, name, "package.json");
          return statSync(join(packagesDir, name)).isDirectory() && existsSync(subPkg);
        })
        .map((name) => `packages/${name}`);
    } catch {}
  }

  return [];
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

  const routeAdapter = findRouteAdapter(routes);
  const dbAdapter = findDbAdapter(dbSchema);
  const hooksAdapter = findHooksAdapter(hooks);

  const routeEnabled = routes !== "none" || scan.routes.detected;
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
            framework: routes !== "none" ? routes : "express",
            apiPrefix: "/",
            filePattern: routeAdapter?.defaultFilePattern ?? "**/*.routes.ts",
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
