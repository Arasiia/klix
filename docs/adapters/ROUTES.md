# Créer un adaptateur de routes

## Interface à implémenter

```typescript
// src/adapters/routes/_base.ts
export interface RouteAdapter {
  id: string;           // identifiant unique → correspond à config.indexers.routes.framework
  name: string;         // nom lisible
  packages: string[];   // packages npm pour l'auto-détection
  defaultFilePattern: string;
  extract(content: string, filePath: string, apiPrefix: string): RouteEntry[];
}

export interface RouteEntry {
  method: string;    // "GET", "POST", "PUT", "PATCH", "DELETE", "ALL", "OPTIONS", "HEAD"
  path: string;      // path complet (apiPrefix + routePrefix + routePath)
  body?: string;     // noms des champs du body séparés par ", "
  handler?: string;  // référence au handler (ex: "userController.getAll")
  file: string;      // chemin relatif du fichier source
}
```

---

## Exemple : Ajouter Koa step-by-step

### Étape 1 — Créer le fichier adaptateur

```typescript
// src/adapters/routes/koa.adapter.ts
import { relative } from "path";
import type { RouteAdapter, RouteEntry } from "./_base";

export const koaAdapter: RouteAdapter = {
  id: "koa",
  name: "Koa",
  packages: ["koa", "@koa/router"],
  defaultFilePattern: "**/routes/**/*.ts",

  extract(content: string, filePath: string, apiPrefix: string): RouteEntry[] {
    const routes: RouteEntry[] = [];

    // Pattern pour router.get("/path", handler)
    const pattern = /router\.(get|post|put|delete|patch)\(\s*["']([^"']+)["']/g;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      routes.push({
        method: match[1].toUpperCase(),
        path: `${apiPrefix}${match[2]}`,
        file: relative(process.cwd(), filePath).replace(/\\/g, "/"),
      });
    }

    return routes;
  },
};
```

### Étape 2 — Enregistrer dans le registre central

```typescript
// src/adapters/index.ts
import { koaAdapter } from "./routes/koa.adapter"; // ← AJOUTER

export const ROUTE_ADAPTERS: RouteAdapter[] = [
  elysiaAdapter,
  expressAdapter,
  koaAdapter, // ← AJOUTER
];
```

C'est tout. `klix index` avec `framework: "koa"` dans la config utilisera automatiquement cet adaptateur.

---

## Template copier-coller

```typescript
import { relative } from "path";
import type { RouteAdapter, RouteEntry } from "./_base";

export const monFrameworkAdapter: RouteAdapter = {
  id: "mon-framework",       // ← identifiant unique
  name: "Mon Framework",     // ← nom lisible
  packages: ["mon-package"], // ← packages npm
  defaultFilePattern: "**/*.routes.ts",

  extract(content: string, filePath: string, apiPrefix: string): RouteEntry[] {
    const routes: RouteEntry[] = [];
    const file = relative(process.cwd(), filePath).replace(/\\/g, "/");

    // TODO: implémenter l'extraction des routes

    return routes;
  },
};
```

---

## Tester l'adaptateur

1. Créer un projet de test avec le framework cible
2. Configurer `klix.config.json` avec `"framework": "mon-framework"`
3. Lancer `bun run dev index` depuis le projet klix
4. Vérifier que `.codeindex/API_ROUTES.md` contient les routes attendues

---

## Adaptateurs existants

| id | Framework | Fichier |
|----|-----------|---------|
| `elysia` | Elysia | `elysia.adapter.ts` |
| `express` | Express | `express.adapter.ts` |
| `koa` | Koa | `koa.adapter.ts` |
