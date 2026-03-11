# Créer un adaptateur de base de données

## Interface à implémenter

```typescript
// src/adapters/db/_base.ts
export interface DbAdapter {
  id: string;           // identifiant unique → correspond à config.indexers.dbSchema.framework
  name: string;
  packages: string[];   // packages npm pour l'auto-détection
  defaultFilePattern: string;
  extract(content: string, filePath: string): { tables: TableDef[]; enums: EnumDef[]; droppedTables?: string[] };
}
```

### Types de sortie

```typescript
export interface TableDef {
  name: string;          // nom SQL de la table (ex: "accounts")
  varName: string;       // nom de la variable TS (ex: "accountsTable")
  columns: ColumnDef[];
  file: string;          // chemin relatif du fichier source
}

export interface ColumnDef {
  name: string;          // nom de la colonne
  type: string;          // type (ex: "uuid", "text", "integer")
  nullable: boolean;     // peut être NULL
  hasDefault: boolean;   // a une valeur par défaut
  isPk: boolean;         // clé primaire
  isFk: boolean;         // clé étrangère
  references?: string;   // "autreTable.colonne" si FK
}

export interface EnumDef {
  name: string;
  values: string[];
}
```

---

## Exemple : Ajouter Knex step-by-step

Knex utilise des migrations JS/TS. L'adaptateur doit parser les appels `table.string("name")`, `table.integer("id").primary()`, etc.

### Étape 1 — Créer le fichier adaptateur

```typescript
// src/adapters/db/knex.adapter.ts
import { relative, basename } from "path";
import type { DbAdapter, TableDef, EnumDef } from "./_base";

export const knexAdapter: DbAdapter = {
  id: "knex",
  name: "Knex.js",
  packages: ["knex"],
  defaultFilePattern: "**/migrations/**/*.ts",

  extract(content: string, filePath: string): { tables: TableDef[]; enums: EnumDef[]; droppedTables?: string[] } {
    const tables: TableDef[] = [];
    const file = relative(process.cwd(), filePath).replace(/\\/g, "/");

    // Exemple de pattern pour createTable
    const tablePattern = /knex\.schema\.createTable\(\s*["'](\w+)["']/g;
    let match;
    while ((match = tablePattern.exec(content)) !== null) {
      tables.push({
        name: match[1],
        varName: match[1],
        columns: [], // TODO: parser les colonnes dans le callback
        file,
      });
    }

    return { tables, enums: [] };
  },
};
```

### Étape 2 — Enregistrer dans le registre central

```typescript
// src/adapters/index.ts
import { knexAdapter } from "./db/knex.adapter"; // ← AJOUTER

export const DB_ADAPTERS: DbAdapter[] = [
  drizzleAdapter,
  knexAdapter, // ← AJOUTER
];
```

---

## Template copier-coller

```typescript
import { relative } from "path";
import type { DbAdapter, TableDef, EnumDef, ColumnDef } from "./_base";

export const monOrmAdapter: DbAdapter = {
  id: "mon-orm",
  name: "Mon ORM",
  packages: ["mon-orm-package"],
  defaultFilePattern: "**/*.schema.ts",

  extract(content: string, filePath: string): { tables: TableDef[]; enums: EnumDef[]; droppedTables?: string[] } {
    const tables: TableDef[] = [];
    const enums: EnumDef[] = [];
    const file = relative(process.cwd(), filePath).replace(/\\/g, "/");

    // TODO: parser les tables et enums

    return { tables, enums };
  },
};
```

---

## Adaptateurs existants

| id | ORM / Outil | Fichier |
|----|-------------|---------|
| `drizzle` | Drizzle ORM | `drizzle.adapter.ts` |
| `knex` | Knex.js | `knex.adapter.ts` |
| `raw-sql` | Raw SQL / Flyway / node-pg-migrate / db-migrate | `raw-sql.adapter.ts` |

---

## Adaptateurs SQL brut

### Quand utiliser `raw-sql` vs `knex`

- **`knex`** : projets qui utilisent l'API fluente Knex (`table.string()`, `table.integer()`, etc.). Les appels `knex.raw()` dans les migrations Knex sont parsés **automatiquement** sans configuration supplémentaire.
- **`raw-sql`** : projets qui écrivent leur DDL directement en SQL pur (fichiers `.sql`), ou qui utilisent des outils comme Flyway, Liquibase, node-pg-migrate, db-migrate (driver SQL), ou golang-migrate.

### Outils compatibles avec `raw-sql`

| Outil | Format |
|-------|--------|
| node-pg-migrate | `.js` ou `.sql` avec `CREATE TABLE` |
| db-migrate (sql driver) | fichiers `.sql` |
| Flyway | `V1__init.sql`, `V2__alter.sql` |
| Liquibase | changeset SQL |
| golang-migrate | `000001_init.up.sql` |
| Fichiers `.sql` custom | tout fichier DDL SQL brut |

### Exemple de fichier `.sql` parsé

```sql
-- Migration : création initiale
CREATE TYPE user_role AS ENUM ('admin', 'user', 'guest');

CREATE TABLE IF NOT EXISTS users (
  id           SERIAL PRIMARY KEY,
  email        VARCHAR(255) NOT NULL,
  role         VARCHAR(50)  DEFAULT 'user',
  created_at   TIMESTAMP    NOT NULL,
  CONSTRAINT users_email_unique UNIQUE (email)
);

CREATE TABLE posts (
  id        SERIAL PRIMARY KEY,
  title     TEXT        NOT NULL,
  user_id   INTEGER     REFERENCES users(id) ON DELETE CASCADE,
  published BOOLEAN     DEFAULT false
);

DROP TABLE IF EXISTS legacy_accounts;
```

### Configuration `klix.config.json`

```json
{
  "indexers": {
    "dbSchema": {
      "framework": "raw-sql",
      "filePattern": "**/migrations/**/*.sql"
    }
  }
}
```

> **Note :** `knex.raw()` dans les migrations Knex est parsé automatiquement sans configuration — il suffit d'utiliser `framework: "knex"`.
