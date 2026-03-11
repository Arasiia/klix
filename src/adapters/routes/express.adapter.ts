import { relative } from "path";
import type { RouteAdapter, RouteEntry } from "./_base";

export const expressAdapter: RouteAdapter = {
  id: "express",
  name: "Express",
  packages: ["express"],
  defaultFilePattern: "**/routes/**/*.{ts,js}",

  extract(content: string, filePath: string, _apiPrefix: string): RouteEntry[] {
    const routes: RouteEntry[] = [];
    const pattern = /\.(get|post|put|delete|patch)\(\s*["'](\/[^"']*)["']/g;
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
