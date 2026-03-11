import { readFileSync } from "fs";
import { globFiles } from "../lib/walker";
import type { KlixConfig } from "../lib/config";
import { findRouteAdapter } from "../adapters";
import { elysiaAdapter } from "../adapters/routes/elysia.adapter";
import { expressAdapter } from "../adapters/routes/express.adapter";
import type { RouteEntry } from "../adapters";

export type { RouteEntry };

/** @deprecated Utiliser elysiaAdapter.extract() depuis src/adapters/routes/elysia.adapter.ts */
export function extractElysiaRoutes(content: string, filePath: string, apiPrefix: string): RouteEntry[] {
  return elysiaAdapter.extract(content, filePath, apiPrefix);
}

/** @deprecated Utiliser expressAdapter.extract() depuis src/adapters/routes/express.adapter.ts */
export function extractExpressRoutes(content: string, filePath: string): RouteEntry[] {
  return expressAdapter.extract(content, filePath, "");
}

/** Helper interne : collecte toutes les routes */
function collectRoutes(rootDir: string, config: KlixConfig): RouteEntry[] | null {
  const { framework, apiPrefix, filePattern } = config.indexers.routes;
  const adapter = findRouteAdapter(framework);
  if (!adapter) return null;

  const files = globFiles(rootDir, filePattern, config.exclude);
  const allRoutes: RouteEntry[] = [];

  for (const filePath of files) {
    let content = "";
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }
    allRoutes.push(...adapter.extract(content, filePath, apiPrefix));
  }

  return allRoutes;
}

/** Retourne les routes groupées par ressource URL (premier segment après apiPrefix) */
export function runRoutesIndexerGrouped(rootDir: string, config: KlixConfig): Map<string, RouteEntry[]> {
  const { apiPrefix } = config.indexers.routes;
  const allRoutes = collectRoutes(rootDir, config);
  if (!allRoutes) return new Map();

  const byResource = new Map<string, RouteEntry[]>();
  for (const route of allRoutes) {
    const seg = route.path.replace(apiPrefix, "").split("/")[1] ?? "root";
    if (!byResource.has(seg)) byResource.set(seg, []);
    byResource.get(seg)!.push(route);
  }
  return byResource;
}

/** Sérialise les routes d'une ressource pour un fichier de split */
export function serializeRoutesSection(resource: string, routes: RouteEntry[], config: KlixConfig): string {
  const { framework } = config.indexers.routes;
  const methodOrder = ["GET", "POST", "PUT", "PATCH", "DELETE"];

  const lines: string[] = [
    `# API_ROUTES/${resource} — ${config.name}`,
    ``,
    `> ${routes.length} endpoints · resource: /${resource} · framework: ${framework}`,
    ``,
    `## /${resource}`,
    `| Méthode | Path | Body |`,
    `|---------|------|------|`,
  ];

  const sorted = [...routes].sort((a, b) => methodOrder.indexOf(a.method) - methodOrder.indexOf(b.method));
  for (const r of sorted) {
    const body = r.body ? `{ ${r.body} }` : "—";
    lines.push(`| \`${r.method}\` | \`${r.path}\` | ${body} |`);
  }
  lines.push(``);

  return lines.join("\n");
}

export function runRoutesIndexer(rootDir: string, config: KlixConfig): string {
  const { framework, apiPrefix } = config.indexers.routes;
  const adapter = findRouteAdapter(framework);

  if (!adapter) {
    console.warn(`[klix] routes: framework inconnu "${framework}". Adaptateurs disponibles : elysia, express`);
    return `# API ROUTES — ${config.name}\n\n> framework "${framework}" non supporté.\n`;
  }

  const allRoutes = collectRoutes(rootDir, config) ?? [];

  // Group by resource (first path segment after apiPrefix)
  const byResource = new Map<string, RouteEntry[]>();
  for (const route of allRoutes) {
    const seg = route.path.replace(apiPrefix, "").split("/")[1] ?? "root";
    if (!byResource.has(seg)) byResource.set(seg, []);
    byResource.get(seg)!.push(route);
  }

  const methodOrder = ["GET", "POST", "PUT", "PATCH", "DELETE"];

  const lines: string[] = [
    `# API ROUTES — ${config.name}`,
    ``,
    `> ${allRoutes.length} endpoints · framework: ${framework}`,
    ``,
  ];

  for (const [resource, routes] of byResource) {
    lines.push(`## /${resource}`);
    lines.push(`| Méthode | Path | Body |`);
    lines.push(`|---------|------|------|`);

    const sorted = routes.sort((a, b) => methodOrder.indexOf(a.method) - methodOrder.indexOf(b.method));

    for (const r of sorted) {
      const body = r.body ? `{ ${r.body} }` : "—";
      lines.push(`| \`${r.method}\` | \`${r.path}\` | ${body} |`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}
