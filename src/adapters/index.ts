import type { RouteAdapter } from "./routes/_base";
import type { DbAdapter } from "./db/_base";
import type { HooksAdapter } from "./hooks/_base";
import type { LanguageAdapter } from "./language/_base";

import { elysiaAdapter } from "./routes/elysia.adapter";
import { expressAdapter } from "./routes/express.adapter";
import { koaAdapter } from "./routes/koa.adapter";
import { drizzleAdapter } from "./db/drizzle.adapter";
import { knexAdapter } from "./db/knex.adapter";
import { rawSqlAdapter } from "./db/raw-sql.adapter";
import { tanstackQueryAdapter } from "./hooks/tanstack-query.adapter";
import { typescriptAdapter } from "./language/typescript.adapter";
import { javascriptAdapter } from "./language/javascript.adapter";

// ↓ AJOUTER 1 IMPORT + 1 LIGNE ICI POUR UN NOUVEL ADAPTATEUR

export const ROUTE_ADAPTERS: RouteAdapter[] = [elysiaAdapter, expressAdapter, koaAdapter];
export const DB_ADAPTERS: DbAdapter[] = [drizzleAdapter, knexAdapter, rawSqlAdapter];
export const HOOKS_ADAPTERS: HooksAdapter[] = [tanstackQueryAdapter];
export const LANGUAGE_ADAPTERS: LanguageAdapter[] = [typescriptAdapter, javascriptAdapter];

// Re-exports des types de base
export type { RouteEntry, RouteAdapter } from "./routes/_base";
export type { ColumnDef, TableDef, EnumDef, DbAdapter } from "./db/_base";
export type { HookEntry, HooksAdapter } from "./hooks/_base";
export type { LanguageAdapter } from "./language/_base";

// Helpers de lookup
export function findRouteAdapter(id: string): RouteAdapter | undefined {
  return ROUTE_ADAPTERS.find((a) => a.id === id);
}

export function findDbAdapter(id: string): DbAdapter | undefined {
  return DB_ADAPTERS.find((a) => a.id === id);
}

export function findHooksAdapter(id: string): HooksAdapter | undefined {
  return HOOKS_ADAPTERS.find((a) => a.id === id);
}

export function findLanguageAdapter(id: string): LanguageAdapter | undefined {
  return LANGUAGE_ADAPTERS.find((a) => a.id === id);
}

// Détection auto depuis package.json (complément de stack-detector.ts)
export function detectRouteFramework(deps: Record<string, string>): string {
  for (const adapter of ROUTE_ADAPTERS) {
    if (adapter.packages.some((pkg) => pkg in deps)) return adapter.id;
  }
  return "none";
}

export function detectDbFramework(deps: Record<string, string>): string {
  for (const adapter of DB_ADAPTERS) {
    if (adapter.packages.some((pkg) => pkg in deps)) return adapter.id;
  }
  return "none";
}

export function detectHooksFramework(deps: Record<string, string>): string {
  for (const adapter of HOOKS_ADAPTERS) {
    if (adapter.packages.some((pkg) => pkg in deps)) return adapter.id;
  }
  return "none";
}
