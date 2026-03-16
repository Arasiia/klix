import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { loadDepsFromPackageJson, detectFrameworksFromStack } from "./stack-detector";

export interface KlixConfig {
  version: string;
  name: string;
  root: string;
  output: string;
  language: string;
  include: string[];
  exclude: string[];
  indexers: {
    files: { enabled: boolean; rolePatterns?: Record<string, string[]> };
    routes: { enabled: boolean; framework: string; apiPrefix: string; filePattern: string };
    functions: { enabled: boolean; includeJsDoc: boolean; servicePattern: string | string[]; excludeTsx: boolean };
    types: { enabled: boolean; filePatterns: string[] };
    dbSchema: { enabled: boolean; framework: string; filePattern: string };
    hooks: { enabled: boolean; filePattern: string; framework: string };
  };
  claude: {
    claudeMdPath: string;
    conventions: string[];
  };
  splitThreshold?: number;
  maxSections?: number;
  domainDepth?: number;
  workspaces?: string[];
}

export const DEFAULT_CONFIG: KlixConfig = {
  version: "1",
  name: "My Project",
  root: ".",
  output: ".codeindex",
  language: "typescript",
  include: [
    "src/**/*.ts",
    "src/**/*.tsx",
    "server/**/*.ts",
    "client/**/*.ts",
    "client/**/*.tsx",
    "app/**/*.ts",
    "lib/**/*.ts",
    "utils/**/*.ts",
  ],
  exclude: [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.git/**",
    "**/*.gen.ts",
    "**/*.d.ts",
    "**/migrations/**",
    "**/drizzle/**",
    "**/__tests__/**",
    "**/*.test.ts",
    "**/*.spec.ts",
    "**/coverage/**",
  ],
  indexers: {
    files: { enabled: true },
    routes: { enabled: true, framework: "elysia", apiPrefix: "/api", filePattern: "**/*.routes.ts" },
    functions: { enabled: true, includeJsDoc: true, servicePattern: "**/*.service.ts", excludeTsx: true },
    types: { enabled: true, filePatterns: ["**/*.api.ts", "**/*.types.ts", "**/*.store.ts"] },
    dbSchema: { enabled: true, framework: "drizzle", filePattern: "server/src/db/schema/*.ts" },
    hooks: { enabled: true, filePattern: "**/hooks/use-*.ts", framework: "tanstack-query" },
  },
  claude: { claudeMdPath: "CLAUDE.md", conventions: [] },
};

export function loadConfig(cwd: string): KlixConfig {
  const configPath = join(cwd, "klix.config.json");
  if (!existsSync(configPath)) return DEFAULT_CONFIG;

  try {
    const raw = readFileSync(configPath, "utf-8");
    const userConfig = JSON.parse(raw);
    return deepMerge(DEFAULT_CONFIG, userConfig) as KlixConfig;
  } catch {
    console.warn("[klix] klix.config.json invalide, config par défaut utilisée.");
    return DEFAULT_CONFIG;
  }
}

function deepMerge(base: any, override: any): any {
  if (typeof base !== "object" || base === null) return override ?? base;
  if (typeof override !== "object" || override === null) return override ?? base;
  if (Array.isArray(base)) return Array.isArray(override) ? override : base;

  const result = { ...base };
  for (const key of Object.keys(override)) {
    result[key] = deepMerge(base[key], override[key]);
  }
  return result;
}

export function detectFramework(cwd: string): { routes: string; dbSchema: string; hooks: string } {
  const deps = loadDepsFromPackageJson(cwd);
  if (!Object.keys(deps).length) return { routes: "none", dbSchema: "none", hooks: "none" };

  const { routes, db, hooks } = detectFrameworksFromStack(deps);
  return { routes, dbSchema: db, hooks };
}
