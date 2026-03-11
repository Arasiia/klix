## klix — développement

### Architecture

Adapter pattern + registre central. Voir `src/adapters/index.ts` pour la structure complète.

```
src/
  adapters/index.ts          ← Registre central (SEUL fichier à modifier pour nouvel adaptateur)
  adapters/routes/           ← Interface RouteAdapter + implémentations
  adapters/db/               ← Interface DbAdapter + implémentations
  adapters/hooks/            ← Interface HooksAdapter + implémentations
  adapters/language/         ← Interface LanguageAdapter + implémentations
  indexers/                  ← Orchestrateurs minces, délèguent aux adapters
  lib/                       ← config.ts, walker.ts, writer.ts, domain-splitter.ts
  commands/                  ← init.cmd.ts, index.cmd.ts, claude-md.cmd.ts
```

### Règles invariantes

- `runXxxIndexer(cwd, config): string` est public et stable — ne pas changer sa signature
- Ajouter un adapter : 1 fichier + 2 lignes dans `src/adapters/index.ts`
- Ne pas modifier `src/lib/config.ts`, `walker.ts`, `writer.ts` sans raison forte

### Split modulaire (v2)

Quand un indexer dépasse le seuil, klix génère des sous-fichiers par domaine.

- Seuil : `config.splitThreshold` (défaut 150 lignes)
- Max domaines : `config.maxSections` (défaut 20, excédent → `_others.md`)
- Utilitaire : `src/lib/domain-splitter.ts` → `extractDomain()`, `shouldSplit()`
- Chaque indexer expose :
  - `runXxxIndexerGrouped()` → `Map<domain, TEntry[]>`
  - `serializeXxxSection(domain, entries, config)` → `string`
- Orchestration dans `src/commands/index.cmd.ts` via `GROUPED_RUNNER_MAP` + `SERIALIZE_MAP`

### Structure des sorties (split actif)

```
.codeindex/
  FUNCTIONS.md          ← summary avec table des domaines
  FUNCTIONS/
    auth.md             ← contenu du domaine auth
    orders.md
  INDEX.md              ← liste tous les fichiers + domaines
```

### Migration-based drop tracking

Les adaptateurs migration-based (Knex) retournent `droppedTables: string[]` depuis `extract()`.
Seule la fonction `up` est parsée (les `down`/rollback sont ignorés).
L'indexeur traite les fichiers en ordre lexicographique et maintient une Map :
drops supprime, creates ajoute/écrase. Le résultat = schéma vivant.
Les adaptateurs déclaratifs (Drizzle) ne sont pas concernés.

### Commandes dev

```bash
bun test                        # tests
bun build src/index.ts          # build
bun run dev index               # indexer un projet
```
