# Contributing to klix

## Vue d'ensemble

klix utilise un **système d'adaptateurs** pour supporter différents frameworks. Chaque framework (Elysia, Drizzle, TanStack Query…) est encapsulé dans un fichier adaptateur indépendant.

```
src/adapters/
  index.ts                        ← Registre central (SEUL fichier à modifier pour enregistrer)
  routes/
    _base.ts                      ← Interface RouteAdapter
    elysia.adapter.ts
    express.adapter.ts
  db/
    _base.ts                      ← Interface DbAdapter
    drizzle.adapter.ts
  hooks/
    _base.ts                      ← Interface HooksAdapter
    tanstack-query.adapter.ts
  language/
    _base.ts                      ← Interface LanguageAdapter
    typescript.adapter.ts
```

**Ajouter un nouveau framework = 1 fichier + 2 lignes dans `src/adapters/index.ts`.**

---

## Prérequis

- [Bun](https://bun.sh/) >= 1.0
- TypeScript (inclus avec Bun)

```bash
# Installer les dépendances
bun install

# Lancer en mode dev
bun run dev

# Lancer les tests
bun test
```

---

## Guides par type d'adaptateur

| Guide | Description |
|-------|-------------|
| [ROUTES.md](./adapters/ROUTES.md) | Créer un adaptateur de routes HTTP |
| [DB.md](./adapters/DB.md) | Créer un adaptateur de schéma de base de données |
| [HOOKS.md](./adapters/HOOKS.md) | Créer un adaptateur de hooks |
| [LANGUAGES.md](./adapters/LANGUAGES.md) | Créer un adaptateur de langage |

---

## Workflow de contribution

1. Fork + clone le repo
2. Créer une branche : `git checkout -b feat/mon-adaptateur`
3. Implémenter l'adaptateur (voir guides ci-dessus)
4. Tester manuellement : `bun run dev index` dans un projet utilisant ce framework
5. Vérifier que `bun test` passe
6. Ouvrir une PR avec une description du framework supporté

---

## Compatibilité ascendante

- Les `id` des adaptateurs correspondent exactement aux valeurs de `framework` dans `klix.config.json`
- Ne pas renommer un `id` existant (breaking change)
- `src/lib/config.ts`, `src/lib/walker.ts`, `src/lib/writer.ts` → ne pas modifier sans raison forte

---

## Découpage modulaire (split)

Quand un indexer dépasse `splitThreshold` lignes (défaut 150), klix génère des sous-fichiers par domaine dans `.codeindex/<INDEXER>/`.

**Règle de domaine** : `extractDomain(filePath)` depuis `src/lib/domain-splitter.ts`.
- `src/auth/user.service.ts` → `auth`
- `server/src/db/schema/user.ts` → `db`
- `src/index.ts` → `root`

**Pour supporter le split dans un nouvel indexer :**

1. Extraire la collecte dans un helper interne `collectXxx()` → `TEntry[]`
2. Ajouter `runXxxIndexerGrouped(rootDir, config)` → `Map<string, TEntry[]>` en pivotant par `extractDomain(entry.file)`
3. Ajouter `serializeXxxSection(domain, entries, config)` → `string` (contenu markdown du fichier domaine)
4. Garder `runXxxIndexer()` inchangé (backward-compatible)
5. Enregistrer dans `GROUPED_RUNNER_MAP` et `SERIALIZE_MAP` dans `src/commands/index.cmd.ts`

**Configuration** :
```json
{
  "splitThreshold": 150,
  "maxSections": 20
}
```
Au-delà de `maxSections` domaines, les excédents sont regroupés dans `_others.md`.
