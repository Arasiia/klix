# Configuration klix

## Vue d'ensemble

klix se configure via un fichier `klix.config.json` à la racine du projet.

- Créé automatiquement par `klix init` (auto-détection des frameworks depuis `package.json`)
- **Toutes les options sont optionnelles** — seules celles à surcharger sont nécessaires, le reste hérite des valeurs par défaut
- Format : JSON standard (pas de commentaires)

---

## Comportement de fusion (merge)

Quand vous définissez une config partielle, klix fusionne vos valeurs avec les défauts selon ces règles :

- **Tableaux** (`include`, `exclude`, `filePatterns`…) → **remplacés entièrement** (pas de concaténation)
- **Objets** (`indexers`, `indexers.routes`…) → **fusionnés récursivement** (seules les clés spécifiées sont écrasées)
- **Scalaires** (`string`, `number`, `boolean`) → **remplacés**

### Exemple

Config utilisateur :
```json
{
  "name": "Mon API",
  "include": ["api/**/*.ts"],
  "indexers": {
    "routes": { "framework": "express" }
  }
}
```

Résultat après fusion :
```json
{
  "version": "1",
  "name": "Mon API",
  "root": ".",
  "output": ".codeindex",
  "language": "typescript",
  "include": ["api/**/*.ts"],
  "exclude": ["**/node_modules/**", "**/dist/**", "...défauts complets..."],
  "indexers": {
    "files": { "enabled": true },
    "routes": { "enabled": true, "framework": "express", "apiPrefix": "/api", "filePattern": "**/*.routes.ts" },
    "functions": { "enabled": true, "includeJsDoc": true, "servicePattern": "**/*.service.ts", "excludeTsx": true },
    "types": { "enabled": true, "filePatterns": ["**/*.api.ts", "**/*.types.ts", "**/*.store.ts"] },
    "dbSchema": { "enabled": true, "framework": "drizzle", "filePattern": "server/src/db/schema/**/*.ts" },
    "hooks": { "enabled": true, "filePattern": "**/hooks/use-*.ts", "framework": "tanstack-query" }
  },
  "claude": { "claudeMdPath": "CLAUDE.md", "conventions": [] }
}
```

Points clés :
- `include` est **remplacé** → les globs par défaut sont perdus (c'est voulu : vous définissez exactement ce que vous voulez inclure)
- `exclude` n'est **pas spécifié** → les défauts sont conservés intégralement
- `indexers.routes` est **fusionné** → seul `framework` change, `apiPrefix` et `filePattern` gardent leurs défauts

---

## Options globales

| Option | Type | Défaut | Description |
|--------|------|--------|-------------|
| `version` | `string` | `"1"` | Version du format de config |
| `name` | `string` | `"My Project"` | Nom affiché dans les index générés |
| `root` | `string` | `"."` | Racine du projet (relatif au dossier contenant `klix.config.json`) |
| `output` | `string` | `".codeindex"` | Dossier de sortie des fichiers markdown |
| `language` | `string` | `"typescript"` | Langage du projet : `"typescript"` ou `"javascript"` |
| `include` | `string[]` | *(voir ci-dessous)* | Globs des fichiers à inclure dans l'indexation |
| `exclude` | `string[]` | *(voir ci-dessous)* | Globs des fichiers à exclure de l'indexation |
| `splitThreshold` | `number` | `150` | Nombre de lignes au-delà duquel un index est découpé par domaine |
| `maxSections` | `number` | `20` | Nombre max de domaines (l'excédent est regroupé dans `_others.md`) |
| `domainDepth` | `number` | `1` | Profondeur de découpage des domaines (1 = premier dossier, 2 = deux niveaux) |
| `workspaces` | `string[]` | — | Chemins des workspaces pour les monorepos |

### Valeurs par défaut de `include`

```json
[
  "src/**/*.ts",
  "src/**/*.tsx",
  "server/**/*.ts",
  "client/**/*.ts",
  "client/**/*.tsx",
  "app/**/*.ts",
  "lib/**/*.ts",
  "utils/**/*.ts"
]
```

### Valeurs par défaut de `exclude`

```json
[
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
  "**/coverage/**"
]
```

---

## Indexers

Chaque indexer se configure dans l'objet `indexers`. Tous possèdent une option `enabled` (`boolean`, défaut `true`) pour les activer/désactiver individuellement.

### `indexers.files`

| Option | Type | Défaut | Description |
|--------|------|--------|-------------|
| `enabled` | `boolean` | `true` | Active/désactive l'indexer de fichiers |
| `rolePatterns` | `Record<string, string[]>` | — | Patterns personnalisés de rôles de fichiers |

`rolePatterns` permet de définir des catégories de fichiers supplémentaires :

```json
"indexers": {
  "files": {
    "rolePatterns": {
      "middleware": ["src/middleware/**"],
      "policy": ["src/policies/**"]
    }
  }
}
```

### `indexers.routes`

| Option | Type | Défaut | Valeurs possibles | Description |
|--------|------|--------|-------------------|-------------|
| `enabled` | `boolean` | `true` | | Active/désactive |
| `framework` | `string` | `"elysia"` | `"elysia"`, `"express"`, `"koa"` | Framework HTTP utilisé |
| `apiPrefix` | `string` | `"/api"` | | Préfixe global des routes |
| `filePattern` | `string` | `"**/*.routes.ts"` | | Glob pour trouver les fichiers de routes |

### `indexers.functions`

| Option | Type | Défaut | Description |
|--------|------|--------|-------------|
| `enabled` | `boolean` | `true` | Active/désactive |
| `includeJsDoc` | `boolean` | `true` | Extraire les commentaires JSDoc |
| `servicePattern` | `string \| string[]` | `"**/*.service.ts"` | Glob(s) des fichiers de fonctions |
| `excludeTsx` | `boolean` | `true` | Exclure les fichiers `.tsx` |

`servicePattern` accepte un string ou un tableau :

```json
"servicePattern": "**/*.service.ts"
```
```json
"servicePattern": ["**/*.service.ts", "**/*.handler.ts"]
```

### `indexers.types`

| Option | Type | Défaut | Description |
|--------|------|--------|-------------|
| `enabled` | `boolean` | `true` | Active/désactive |
| `filePatterns` | `string[]` | `["**/*.api.ts", "**/*.types.ts", "**/*.store.ts"]` | Globs des fichiers de types |

### `indexers.dbSchema`

| Option | Type | Défaut | Valeurs possibles | Description |
|--------|------|--------|-------------------|-------------|
| `enabled` | `boolean` | `true` | | Active/désactive |
| `framework` | `string` | `"drizzle"` | `"drizzle"`, `"knex"` | ORM utilisé |
| `filePattern` | `string` | `"server/src/db/schema/**/*.ts"` | | Glob des fichiers de schéma |

### `indexers.hooks`

| Option | Type | Défaut | Valeurs possibles | Description |
|--------|------|--------|-------------------|-------------|
| `enabled` | `boolean` | `true` | | Active/désactive |
| `framework` | `string` | `"tanstack-query"` | `"tanstack-query"` | Librairie de hooks |
| `filePattern` | `string` | `"**/hooks/use-*.ts"` | | Glob des fichiers de hooks |

---

## Section Claude

| Option | Type | Défaut | Description |
|--------|------|--------|-------------|
| `claude.claudeMdPath` | `string` | `"CLAUDE.md"` | Chemin du fichier CLAUDE.md à générer/mettre à jour |
| `claude.conventions` | `string[]` | `[]` | Conventions de développement injectées dans le CLAUDE.md généré |

```json
"claude": {
  "claudeMdPath": "CLAUDE.md",
  "conventions": [
    "Utiliser des early returns",
    "Pas de classes, uniquement des fonctions"
  ]
}
```

---

## Monorepo (workspaces)

klix supporte les monorepos via l'option `workspaces`. Chaque workspace est indexé indépendamment avec sa propre config fusionnée.

- `klix init` auto-détecte les workspaces depuis `package.json` (champ `workspaces`)
- Les chemins sont relatifs à la racine du monorepo
- Les patterns glob (`packages/*`, `apps/*`) sont supportés et résolus automatiquement

```json
{
  "name": "Mon Monorepo",
  "workspaces": ["packages/api", "packages/web", "packages/shared"]
}
```

Avec des globs (style Yarn/pnpm workspaces) :

```json
{
  "name": "Mon Monorepo",
  "workspaces": ["apps/*", "packages/*"]
}
```

---

## `domainDepth` — Granularité des domaines

Contrôle la finesse du découpage par domaine lors du split. Par défaut (`1`), klix prend uniquement le **premier segment significatif** du chemin comme domaine.

Avec `domainDepth: 2`, klix descend deux niveaux, ce qui est utile pour les projets organisés en modules ou features.

| Chemin | depth=1 | depth=2 |
|--------|---------|---------|
| `src/modules/accounts/accounts.service.ts` | `modules` | `modules.accounts` |
| `src/modules/auth/auth.service.ts` | `modules` | `modules.auth` |
| `src/api/accounts.api.ts` | `api` | `api.accounts` |
| `src/hooks/use-accounts.ts` | `hooks` | `hooks.use-accounts` |
| `src/auth/auth.service.ts` | `auth` | `auth` *(dédup automatique)* |

**Cas d'usage typique** : projet avec une structure `src/modules/<feature>/` ou `src/features/<feature>/`, où depth=1 regroupe tout dans un seul fichier `FUNCTIONS/modules.md` trop volumineux.

`klix init` détecte automatiquement et écrit `domainDepth: 2` si la structure du projet le justifie.

---

## Notes importantes

- Mettre `language: "javascript"` ne change **pas** les patterns `include` — il faut aussi adapter les globs manuellement (remplacer `*.ts` par `*.js`)
- `klix init` auto-détecte les frameworks depuis `package.json` — rarement besoin de les configurer manuellement
- En cas de config JSON invalide → fallback silencieux sur les défauts avec un warning dans la console

---

## Exemples pratiques

### Config minimale

```json
{
  "name": "Mon Projet"
}
```

Tout le reste utilise les valeurs par défaut.

### Désactiver certains indexers

```json
{
  "indexers": {
    "hooks": { "enabled": false },
    "dbSchema": { "enabled": false }
  }
}
```

### Projet JavaScript

```json
{
  "language": "javascript",
  "include": [
    "src/**/*.js",
    "src/**/*.jsx",
    "lib/**/*.js"
  ],
  "indexers": {
    "routes": { "framework": "express", "filePattern": "**/routes/**/*.js" },
    "functions": { "servicePattern": "**/*.service.js", "excludeTsx": false },
    "types": { "enabled": false }
  }
}
```

### Monorepo

```json
{
  "name": "Acme Platform",
  "workspaces": ["apps/api", "apps/web", "packages/shared"]
}
```

Ou avec des globs si votre `package.json` racine utilise la syntaxe Yarn/pnpm :

```json
{
  "name": "Acme Platform",
  "workspaces": ["apps/*", "packages/*"]
}
```

### Patterns personnalisés

```json
{
  "include": ["src/**/*.ts", "modules/**/*.ts"],
  "indexers": {
    "files": {
      "rolePatterns": {
        "middleware": ["src/middleware/**"],
        "guard": ["src/guards/**"],
        "decorator": ["src/decorators/**"]
      }
    },
    "functions": {
      "servicePattern": ["**/*.service.ts", "**/*.handler.ts", "**/*.usecase.ts"]
    },
    "routes": {
      "framework": "express",
      "filePattern": "**/controllers/**/*.ts",
      "apiPrefix": "/v2"
    }
  }
}
```
