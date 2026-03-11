import { relative } from "path";
import type { RouteAdapter, RouteEntry } from "./_base";

export const elysiaAdapter: RouteAdapter = {
  id: "elysia",
  name: "Elysia",
  packages: ["elysia"],
  defaultFilePattern: "**/*.routes.ts",

  extract(content: string, filePath: string, apiPrefix: string): RouteEntry[] {
    const routes: RouteEntry[] = [];

    // Extract prefix
    const prefixMatch = content.match(/new Elysia\(\s*\{\s*prefix:\s*["']([^"']+)["']/s);
    const routePrefix = prefixMatch ? prefixMatch[1] : "";

    // Extract body variable names
    const bodyVars = new Map<string, string>();
    const bodyVarPattern = /const (\w+Body)\s*=\s*t\.Object\(\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/gs;
    let bm;
    while ((bm = bodyVarPattern.exec(content)) !== null) {
      const fields: string[] = [];
      const fieldPattern = /^\s+(\w+):/gm;
      let fm;
      const bodyContent = bm[2];
      while ((fm = fieldPattern.exec(bodyContent)) !== null) {
        fields.push(fm[1]);
      }
      bodyVars.set(bm[1], fields.join(", "));
    }

    // Extract HTTP methods
    const methodPattern =
      /\.(get|post|put|delete|patch)\(\s*["']([^"']*?)["']([^)]*\{[^}]*body:\s*(\w+Body)[^}]*\})?/gs;
    let match;
    while ((match = methodPattern.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      const routePath = match[2];
      const bodyVarName = match[4];
      const bodyDesc = bodyVarName ? bodyVars.get(bodyVarName) : undefined;

      const fullPath = `${apiPrefix}${routePrefix}${routePath}`;
      routes.push({
        method,
        path: fullPath,
        body: bodyDesc,
        file: relative(process.cwd(), filePath).replace(/\\/g, "/"),
      });
    }

    return routes;
  },
};
