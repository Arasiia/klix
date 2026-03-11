# Créer un adaptateur de hooks

## Interface à implémenter

```typescript
// src/adapters/hooks/_base.ts
export interface HooksAdapter {
  id: string;           // identifiant unique → correspond à config.indexers.hooks.framework
  name: string;
  packages: string[];   // packages npm pour l'auto-détection
  defaultFilePattern: string;
  classifyHook(content: string, fnName: string): HookEntry["kind"];
  extractQueryKey?(content: string, fnName: string): string | undefined;
  extractMutationFn?(content: string, fnName: string): string | undefined;
}

export interface HookEntry {
  name: string;
  kind: "query" | "mutation" | "queryKey" | "other";
  queryKey?: string;
  mutationFn?: string;
  file: string;
}
```

---

## Exemple : Ajouter SWR

SWR utilise `useSWR()` pour les queries et `useSWRMutation()` pour les mutations.

### Étape 1 — Créer le fichier adaptateur

```typescript
// src/adapters/hooks/swr.adapter.ts
import type { HooksAdapter, HookEntry } from "./_base";

function findFunctionBody(content: string, fnName: string): string {
  const pattern = new RegExp(`export\\s+(?:function|const)\\s+${fnName}\\b`);
  const m = pattern.exec(content);
  if (!m) return "";
  return content.slice(m.index, m.index + 600);
}

export const swrAdapter: HooksAdapter = {
  id: "swr",
  name: "SWR",
  packages: ["swr"],
  defaultFilePattern: "**/hooks/use-*.ts",

  classifyHook(content: string, fnName: string): HookEntry["kind"] {
    const slice = findFunctionBody(content, fnName);
    if (!slice) return "other";
    if (/useSWR\s*\(/.test(slice)) return "query";
    if (/useSWRMutation\s*\(/.test(slice)) return "mutation";
    return "other";
  },

  extractQueryKey(content: string, fnName: string): string | undefined {
    const slice = findFunctionBody(content, fnName);
    if (!slice) return undefined;
    const match = slice.match(/useSWR\s*\(\s*([^,)]+)/);
    return match ? match[1].trim() : undefined;
  },
};
```

### Étape 2 — Enregistrer dans le registre central

```typescript
// src/adapters/index.ts
import { swrAdapter } from "./hooks/swr.adapter"; // ← AJOUTER

export const HOOKS_ADAPTERS: HooksAdapter[] = [
  tanstackQueryAdapter,
  swrAdapter, // ← AJOUTER
];
```

---

## Template copier-coller

```typescript
import type { HooksAdapter, HookEntry } from "./_base";

export const monHooksAdapter: HooksAdapter = {
  id: "ma-lib",
  name: "Ma Lib",
  packages: ["ma-lib-package"],
  defaultFilePattern: "**/hooks/use-*.ts",

  classifyHook(content: string, fnName: string): HookEntry["kind"] {
    // TODO: analyser le contenu pour classifier le hook
    return "other";
  },

  // Optionnel
  extractQueryKey(content: string, fnName: string): string | undefined {
    return undefined;
  },

  // Optionnel
  extractMutationFn(content: string, fnName: string): string | undefined {
    return undefined;
  },
};
```

---

## Adaptateurs existants

| id | Lib | Fichier |
|----|-----|---------|
| `tanstack-query` | TanStack Query | `tanstack-query.adapter.ts` |
