import { relative } from "path";
import type { RouteAdapter, RouteEntry } from "./_base";

const SKIP_HANDLERS = new Set(["cleanResponse", "sendJSON", "next"]);

/**
 * Extrait le handler significatif d'un bloc d'arguments multi-lignes.
 * Heuristique : dernier argument qui ressemble à un identifiant (contient un `.`)
 * et n'est pas un middleware utilitaire connu.
 */
function extractHandler(argsBlock: string): string | undefined {
  const args = argsBlock
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a.length > 0);

  const handler = args
    .reverse()
    .find((a) => !SKIP_HANDLERS.has(a) && !a.startsWith("(") && !a.startsWith("function"));
  if (!handler) return undefined;
  const cleaned = handler.replace(/\.bind\(.*$/, "");
  // Ne garder que les identifiants simples ou dotted (pas les appels de fonctions)
  if (/^[\w$.]+$/.test(cleaned)) return cleaned;
  return undefined;
}

export const expressAdapter: RouteAdapter = {
  id: "express",
  name: "Express",
  packages: ["express"],
  defaultFilePattern: "**/{routes,controllers}/**/*.{ts,js}",

  extract(content: string, filePath: string, apiPrefix: string): RouteEntry[] {
    const routes: RouteEntry[] = [];
    // Phase 1 : détecter méthode + path (fonctionne même si la route est multi-lignes)
    const pathPattern = /\.(get|post|put|delete|patch|all|options|head)\(\s*["'](\/[^"']*)["']/g;
    let match;
    while ((match = pathPattern.exec(content)) !== null) {
      const fullPath =
        apiPrefix && apiPrefix !== "/"
          ? `${apiPrefix}${match[2]}`.replace(/\/+/g, "/")
          : match[2];

      const route: RouteEntry = {
        method: match[1].toUpperCase(),
        path: fullPath,
        file: relative(process.cwd(), filePath).replace(/\\/g, "/"),
      };

      // Phase 2 : chercher les args jusqu'à la parenthèse fermante (balance depth)
      const afterPath = content.slice(match.index + match[0].length);
      let depth = 1; // on est déjà après l'ouverture `(`
      let i = 0;
      for (; i < afterPath.length && depth > 0; i++) {
        if (afterPath[i] === "(") depth++;
        else if (afterPath[i] === ")") depth--;
      }
      if (depth === 0) {
        const argsBlock = afterPath.slice(0, i - 1).trim();
        if (argsBlock.length > 0) {
          // Retirer le premier séparateur (la virgule après le path)
          const cleaned = argsBlock.startsWith(",") ? argsBlock.slice(1).trim() : argsBlock;
          if (cleaned.length > 0) {
            const handler = extractHandler(cleaned);
            if (handler) route.handler = handler;
          }
        }
      }

      routes.push(route);
    }
    return routes;
  },
};
