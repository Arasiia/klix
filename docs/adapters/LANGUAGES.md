# Créer un adaptateur de langage

## Interface à implémenter

```typescript
// src/adapters/language/_base.ts
export interface LanguageAdapter {
  id: string;           // identifiant unique → correspond à config.language
  name: string;
  extensions: string[]; // ex: [".ts", ".tsx"]

  // Patterns regex pour les indexeurs functions et types
  exportFunctionPattern: RegExp;    // groupes: [1]=prefix, [2]=async?, [3]=nom, [4]=params
  exportConstArrowPattern: RegExp;  // groupes: [1]=nom, [2]=async?, [3]=params
  interfacePattern: RegExp;         // groupes: [1]=nom, [2]=corps
  typeAliasPattern: RegExp;         // groupes: [1]=nom, [2]=valeur
  enumPattern: RegExp;              // groupes: [1]=nom, [2]=corps

  extractServiceMethods?: boolean;  // si vrai, extrait aussi les méthodes de classe/objet
}
```

### Conventions des groupes de capture

Les indexeurs `functions.indexer.ts` et `types.indexer.ts` attendent des groupes à des positions précises :

| Pattern | Groupe 1 | Groupe 2 | Groupe 3 | Groupe 4 |
|---------|----------|----------|----------|----------|
| `exportFunctionPattern` | full prefix | `async ` ou vide | nom | params |
| `exportConstArrowPattern` | nom | `async ` ou vide | params | — |
| `interfacePattern` | nom | corps | — | — |
| `typeAliasPattern` | nom | valeur | — | — |
| `enumPattern` | nom | corps | — | — |

---

## Exemple : Ajouter Kotlin step-by-step

### Étape 1 — Créer le fichier adaptateur

```typescript
// src/adapters/language/kotlin.adapter.ts
import type { LanguageAdapter } from "./_base";

export const kotlinAdapter: LanguageAdapter = {
  id: "kotlin",
  name: "Kotlin",
  extensions: [".kt", ".kts"],
  extractServiceMethods: false,

  // fun myFunction(param: Type): ReturnType
  // Groupes: [1]=full, [2]=suspend?, [3]=nom, [4]=params
  exportFunctionPattern: /^((?:suspend\s+)?fun\s+(\w+))\s*\(([^)]*)\)/gm,

  // val myFn: (Type) -> ReturnType = { ... }
  // Groupes: [1]=nom, [2]=undefined, [3]=params
  exportConstArrowPattern: /^val\s+(\w+)\s*:\s*\([^)]*\)\s*->/gm,

  // interface MyInterface { ... }
  interfacePattern: /interface\s+(\w+)(?:\s*:\s*[^{]+)?\s*\{([^}]+)\}/gs,

  // typealias MyType = OtherType
  typeAliasPattern: /typealias\s+(\w+)\s*=\s*([^\n]+)/g,

  // enum class MyEnum { VALUE1, VALUE2 }
  enumPattern: /enum\s+class\s+(\w+)(?:[^{]*)?\{([^}]+)\}/gs,
};
```

### Étape 2 — Enregistrer dans le registre central

```typescript
// src/adapters/index.ts
import { kotlinAdapter } from "./language/kotlin.adapter"; // ← AJOUTER

export const LANGUAGE_ADAPTERS: LanguageAdapter[] = [
  typescriptAdapter,
  kotlinAdapter, // ← AJOUTER
];
```

### Étape 3 — Configurer le projet

Dans `klix.config.json` du projet Kotlin :
```json
{
  "language": "kotlin",
  "include": ["src/**/*.kt"],
  "indexers": {
    "functions": { "enabled": true, "includeJsDoc": false }
  }
}
```

---

## Template copier-coller

```typescript
import type { LanguageAdapter } from "./_base";

export const monLangageAdapter: LanguageAdapter = {
  id: "mon-langage",
  name: "Mon Langage",
  extensions: [".ext"],
  extractServiceMethods: false,

  exportFunctionPattern: /TODO/gm,
  exportConstArrowPattern: /TODO/gm,
  interfacePattern: /TODO/gs,
  typeAliasPattern: /TODO/g,
  enumPattern: /TODO/gs,
};
```

---

## Fallback automatique

Si `config.language` ne correspond à aucun adaptateur enregistré, les indexeurs utilisent automatiquement `typescriptAdapter` comme fallback. Aucune erreur n'est levée, mais un warning est affiché en console.

---

## Adaptateurs existants

| id | Langage | Fichier |
|----|---------|---------|
| `typescript` | TypeScript / JavaScript | `typescript.adapter.ts` |
