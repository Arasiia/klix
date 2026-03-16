# klix

[![version](https://img.shields.io/badge/version-0.1.6-blue)](https://github.com/Arasiia/klix/releases)
[![latest](https://img.shields.io/github/v/release/Arasiia/klix)](https://github.com/Arasiia/klix/releases/latest)
[![ci](https://github.com/Arasiia/klix/actions/workflows/ci.yml/badge.svg)](https://github.com/Arasiia/klix/actions/workflows/ci.yml)
[![coverage](https://raw.githubusercontent.com/Arasiia/klix/gh-pages/coverage.svg)](https://github.com/Arasiia/klix/actions/workflows/ci.yml)

**CLI d'indexage codebase pour Claude** — génère des fichiers markdown compacts qui réduisent la consommation de tokens de 70-90% par demande.

---

## Installation

### Méthode 1 : GitHub Releases (recommandée, aucune dépendance)

**macOS ARM (Apple Silicon)**
```bash
KLIX_VERSION=$(curl -sL "https://api.github.com/repos/Arasiia/klix/releases/latest" | grep '"tag_name":' | sed -E 's/.*"v([^"]+)".*/\1/')
curl -fOL "https://github.com/Arasiia/klix/releases/download/v${KLIX_VERSION}/klix-macos-arm64"
chmod +x klix-macos-arm64 && sudo mv klix-macos-arm64 /usr/local/bin/klix
klix --version
```

**macOS Intel (x64)**
```bash
KLIX_VERSION=$(curl -sL "https://api.github.com/repos/Arasiia/klix/releases/latest" | grep '"tag_name":' | sed -E 's/.*"v([^"]+)".*/\1/')
curl -fOL "https://github.com/Arasiia/klix/releases/download/v${KLIX_VERSION}/klix-macos-x64"
chmod +x klix-macos-x64 && sudo mv klix-macos-x64 /usr/local/bin/klix
```

**Linux x64**
```bash
KLIX_VERSION=$(curl -sL "https://api.github.com/repos/Arasiia/klix/releases/latest" | grep '"tag_name":' | sed -E 's/.*"v([^"]+)".*/\1/')
curl -fOL "https://github.com/Arasiia/klix/releases/download/v${KLIX_VERSION}/klix-linux-x64"
chmod +x klix-linux-x64 && sudo mv klix-linux-x64 /usr/local/bin/klix
```

### Méthode 2 : bun link (développement local)
```bash
git clone https://github.com/Arasiia/klix
cd klix && bun link
```

### Méthode 3 : install.sh (auto-détecte OS/arch)
```bash
curl -fsSL https://raw.githubusercontent.com/Arasiia/klix/master/install.sh | bash
```

---

## Quickstart

```bash
# 1. Créer la config (auto-détecte le framework)
klix init

# 2. Générer tous les index
klix index

# 3. Injecter la section dans CLAUDE.md
klix claude-md
```

---

## Commandes

| Commande | Description |
|----------|-------------|
| `klix` | Alias de `klix index` |
| `klix index` | Génère `.codeindex/*.md` |
| `klix index --cwd /path` | Indexer un projet spécifique |
| `klix index --only routes,hooks` | Index sélectif |
| `klix init` | Crée `klix.config.json` |
| `klix claude-md` | Génère/met à jour `CLAUDE.md` |
| `klix upgrade` | Met à jour klix vers la dernière version |
| `klix upgrade --check` | Vérifie si une mise à jour est disponible (sans installer) |
| `klix --version` | Affiche la version |
| `klix --help` | Affiche l'aide |

---

## Config `klix.config.json`

```json
{
  "version": "1",
  "name": "Mon Projet",        // Nom affiché dans les index
  "root": ".",                  // Racine du projet
  "output": ".codeindex",       // Dossier de sortie
  "language": "typescript",     // "typescript" ou "javascript"
  "include": ["src/**/*.ts"],   // Patterns inclus
  "exclude": ["**/node_modules/**"], // Patterns exclus
  "indexers": { ... },          // Config par indexer
  "claude": {
    "claudeMdPath": "CLAUDE.md" // Path du fichier Claude
  },
  "splitThreshold": 150,        // Seuil de lignes avant découpage par domaine
  "maxSections": 20             // Nombre max de domaines (excédent → _others.md)
}
```

> Documentation complète de la configuration : [docs/CONFIG.md](./docs/CONFIG.md)

---

## Frameworks supportés

| Catégorie | Frameworks |
|-----------|-----------|
| Routes | `elysia`, `express`, `koa` |
| DB Schema | `drizzle`, `knex` |
| Hooks | `tanstack-query` |
| Langages | `typescript`, `javascript` |

---

## Architecture

klix utilise un **système d'adaptateurs** — ajouter un nouveau framework = 1 fichier + 2 lignes dans le registre.

```
src/adapters/
  index.ts              ← Registre central
  routes/               ← Adaptateurs routes (Elysia, Express, Koa…)
  db/                   ← Adaptateurs ORM (Drizzle, Knex, Prisma…)
  hooks/                ← Adaptateurs hooks (TanStack Query, SWR…)
  language/             ← Adaptateurs langage (TypeScript, Kotlin…)
```

Voir [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md) pour les guides de contribution.

---

## Fichiers générés

```
.codeindex/
├── INDEX.md        # Master index + workflow par tâche
├── FILES.md        # Structure fichiers, rôles, exports
├── API_ROUTES.md   # Endpoints HTTP (méthode + path + body)
├── FUNCTIONS.md    # Fonctions exportées + signatures + JSDoc
├── TYPES.md        # Interfaces, type aliases, enums
├── DB_SCHEMA.md    # Tables, colonnes, FK
└── HOOKS.md        # Hooks React Query (queries + mutations)
```

### Découpage automatique par domaine

Sur les gros projets, quand un fichier dépasse `splitThreshold` lignes (défaut : 150), klix découpe automatiquement en sous-fichiers par domaine :

```
.codeindex/
├── FUNCTIONS.md          # summary + table des domaines
├── FUNCTIONS/
│   ├── auth.md           # fonctions du domaine auth
│   ├── orders.md
│   └── utils.md
└── INDEX.md              # liste les domaines pour chaque index découpé
```

Le domaine est extrait du premier segment significatif du chemin source (`src/auth/…` → `auth`). Claude peut cibler directement le bon fichier sans lire l'index complet.

### Exemple `API_ROUTES.md`
```markdown
## /accounts
| Méthode | Path | Body |
|---------|------|------|
| `GET` | `/api/accounts` | — |
| `POST` | `/api/accounts` | { name, type, initialBalanceCents } |
| `GET` | `/api/accounts/:id` | — |
| `PUT` | `/api/accounts/:id` | { name, type, ... } |
| `DELETE` | `/api/accounts/:id` | — |
```

---

## Intégration CLAUDE.md

`klix claude-md` injecte/met à jour un bloc entre marqueurs :

```markdown
<!-- klix:start -->
## AI Index (klix)
...
<!-- klix:end -->
```

Si `CLAUDE.md` existe → remplace le bloc.
Si `CLAUDE.md` n'existe pas → crée le fichier.

---

## Exemples sur différents projets

### Bun/Elysia fullstack
```json
{
  "indexers": {
    "routes": { "framework": "elysia", "filePattern": "**/*.routes.ts" },
    "dbSchema": { "framework": "drizzle", "filePattern": "server/src/db/schema/*.ts" },
    "hooks": { "framework": "tanstack-query", "filePattern": "**/hooks/use-*.ts" }
  }
}
```

### Express API
```json
{
  "indexers": {
    "routes": { "framework": "express", "filePattern": "**/routes/**/*.ts" },
    "dbSchema": { "framework": "prisma", "filePattern": "prisma/schema.prisma" }
  }
}
```

### Koa API + Knex migrations
```json
{
  "language": "javascript",
  "indexers": {
    "routes": { "framework": "koa", "filePattern": "**/routes/**/*.js" },
    "dbSchema": { "framework": "knex", "filePattern": "**/migrations/**/*.js" }
  }
}
```

---

## Release / CI

Pour créer une nouvelle release :

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions compile automatiquement les binaires pour Linux x64, macOS x64, et macOS ARM64.
