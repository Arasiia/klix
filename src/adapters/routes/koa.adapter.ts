import { relative } from "path";
import type { RouteAdapter, RouteEntry } from "./_base";

export const koaAdapter: RouteAdapter = {
  id: "koa",
  name: "Koa Router",
  packages: ["@koa/router", "koa-router"],
  defaultFilePattern: "**/routes/**/*.ts",

  extract(content: string, filePath: string, _apiPrefix: string): RouteEntry[] {
    const routes: RouteEntry[] = [];
    // Gère : router.get('/path', h) et router.get('name', '/path', h)
    const pattern =
      /router\.(get|post|put|delete|patch)\(\s*(?:['"][^'"]+['"]\s*,\s*)?['"]([^'"]+)['"]/g;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      routes.push({
        method: match[1].toUpperCase(),
        path: match[2],
        file: relative(process.cwd(), filePath).replace(/\\/g, "/"),
      });
    }
    return routes;
  },
};
