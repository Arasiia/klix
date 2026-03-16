import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { parseDrizzleColumn, extractDrizzleTables, runDbSchemaIndexer } from "../../src/indexers/db-schema.indexer";
import { DEFAULT_CONFIG } from "../../src/lib/config";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "klix-db-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("parseDrizzleColumn", () => {
  it("parse une colonne simple", () => {
    const col = parseDrizzleColumn("  name: varchar('name'),");
    expect(col).not.toBeNull();
    expect(col?.name).toBe("name");
    expect(col?.type).toBe("varchar");
    expect(col?.isPk).toBe(false);
    expect(col?.isFk).toBe(false);
  });

  it("détecte une clé primaire", () => {
    const col = parseDrizzleColumn("  id: uuid('id').primaryKey().defaultRandom(),");
    expect(col?.isPk).toBe(true);
    expect(col?.nullable).toBe(false); // PK = non nullable
    expect(col?.hasDefault).toBe(true);
  });

  it("détecte une clé étrangère avec références", () => {
    const col = parseDrizzleColumn("  userId: uuid('user_id').references(() => users.id),");
    expect(col?.isFk).toBe(true);
    expect(col?.references).toBe("users.id");
  });

  it("détecte notNull()", () => {
    const col = parseDrizzleColumn("  email: varchar('email').notNull(),");
    expect(col?.nullable).toBe(false);
  });

  it("nullable par défaut sans notNull()", () => {
    const col = parseDrizzleColumn("  bio: text('bio'),");
    expect(col?.nullable).toBe(true);
  });

  it("détecte .default()", () => {
    const col = parseDrizzleColumn("  status: varchar('status').default('active'),");
    expect(col?.hasDefault).toBe(true);
  });

  it("détecte .defaultNow()", () => {
    const col = parseDrizzleColumn("  createdAt: timestamp('created_at').defaultNow(),");
    expect(col?.hasDefault).toBe(true);
  });

  it("retourne null si la ligne n'est pas une colonne", () => {
    const col = parseDrizzleColumn("  // commentaire");
    expect(col).toBeNull();
  });

  it("retourne null pour une ligne vide", () => {
    const col = parseDrizzleColumn("");
    expect(col).toBeNull();
  });
});

describe("extractDrizzleTables", () => {
  const file = "/fake/schema/users.ts";

  it("extrait une table avec ses colonnes", () => {
    const content = `
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email').notNull(),
});
`;
    const { tables } = extractDrizzleTables(content, file);
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe("users");
    expect(tables[0].varName).toBe("users");
    expect(tables[0].columns.some((c) => c.name === "id" && c.isPk)).toBe(true);
    expect(tables[0].columns.some((c) => c.name === "name")).toBe(true);
  });

  it("extrait les pgEnums", () => {
    const content = `export const roleEnum = pgEnum('role', ['admin', 'user', 'guest']);`;
    const { enums } = extractDrizzleTables(content, file);
    expect(enums).toHaveLength(1);
    expect(enums[0].name).toBe("roleEnum");
    expect(enums[0].values).toContain("admin");
    expect(enums[0].values).toContain("user");
  });

  it("extrait plusieurs tables", () => {
    const content = `
export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
});

export const posts = pgTable('posts', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').references(() => users.id),
});
`;
    const { tables } = extractDrizzleTables(content, file);
    expect(tables).toHaveLength(2);
    expect(tables.map((t) => t.name)).toContain("users");
    expect(tables.map((t) => t.name)).toContain("posts");
  });

  it("retourne tableaux vides si pas de tables", () => {
    const content = `const x = 42;`;
    const { tables, enums } = extractDrizzleTables(content, file);
    expect(tables).toHaveLength(0);
    expect(enums).toHaveLength(0);
  });
});

describe("runDbSchemaIndexer", () => {
  it("génère le header avec le nom du projet", () => {
    const config = { ...DEFAULT_CONFIG, name: "my-app", exclude: [] };
    const output = runDbSchemaIndexer(tmpDir, config);
    expect(output).toContain("# DB SCHEMA — my-app");
    expect(output).toContain("framework: drizzle");
  });

  it("indexe un schéma Drizzle depuis un fichier réel", () => {
    mkdirSync(join(tmpDir, "db", "schema"), { recursive: true });
    writeFileSync(
      join(tmpDir, "db", "schema", "users.ts"),
      `
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name').notNull(),
  email: varchar('email').notNull(),
});
`,
    );
    const config = {
      ...DEFAULT_CONFIG,
      exclude: [],
      indexers: {
        ...DEFAULT_CONFIG.indexers,
        dbSchema: {
          enabled: true,
          framework: "drizzle",
          filePattern: "db/schema/**/*.ts",
        },
      },
    };
    const output = runDbSchemaIndexer(tmpDir, config);
    expect(output).toContain("users");
    expect(output).toContain("id");
    expect(output).toContain("🔑"); // primary key marker
  });

  it("affiche les enums dans la section Enums", () => {
    mkdirSync(join(tmpDir, "db", "schema"), { recursive: true });
    writeFileSync(
      join(tmpDir, "db", "schema", "enums.ts"),
      `export const statusEnum = pgEnum('status', ['active', 'inactive']);`,
    );
    const config = {
      ...DEFAULT_CONFIG,
      exclude: [],
      indexers: {
        ...DEFAULT_CONFIG.indexers,
        dbSchema: {
          enabled: true,
          framework: "drizzle",
          filePattern: "db/schema/**/*.ts",
        },
      },
    };
    const output = runDbSchemaIndexer(tmpDir, config);
    expect(output).toContain("## Enums");
    expect(output).toContain("statusEnum");
    expect(output).toContain("active");
  });

  it("affiche les FK avec leur référence", () => {
    mkdirSync(join(tmpDir, "db", "schema"), { recursive: true });
    writeFileSync(
      join(tmpDir, "db", "schema", "posts.ts"),
      `
export const posts = pgTable('posts', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').references(() => users.id),
});
`,
    );
    const config = {
      ...DEFAULT_CONFIG,
      exclude: [],
      indexers: {
        ...DEFAULT_CONFIG.indexers,
        dbSchema: {
          enabled: true,
          framework: "drizzle",
          filePattern: "db/schema/**/*.ts",
        },
      },
    };
    const output = runDbSchemaIndexer(tmpDir, config);
    expect(output).toContain("→ users.id");
  });
});

describe("runDbSchemaIndexer — Knex drop tracking", () => {
  it("migration create puis migration drop → table absente", () => {
    mkdirSync(join(tmpDir, "migrations"), { recursive: true });
    writeFileSync(
      join(tmpDir, "migrations", "20230101_create_users.ts"),
      `
exports.up = function(knex) {
  return knex.schema.createTable('users', function(table) {
    table.increments('id');
    table.string('name');
  });
};
exports.down = function(knex) {
  return knex.schema.dropTable('users');
};
`,
    );
    writeFileSync(
      join(tmpDir, "migrations", "20230201_drop_users.ts"),
      `
exports.up = function(knex) {
  return knex.schema.dropTable('users');
};
exports.down = function(knex) {
  return knex.schema.createTable('users', function(table) {
    table.increments('id');
    table.string('name');
  });
};
`,
    );
    const config = {
      ...DEFAULT_CONFIG,
      exclude: [],
      indexers: {
        ...DEFAULT_CONFIG.indexers,
        dbSchema: {
          enabled: true,
          framework: "knex",
          filePattern: "migrations/**/*.ts",
        },
      },
    };
    const output = runDbSchemaIndexer(tmpDir, config);
    expect(output).toContain("0 tables");
    expect(output).not.toContain("### `users`");
  });

  it("create → drop → re-create → table présente avec colonnes de la dernière version", () => {
    mkdirSync(join(tmpDir, "migrations"), { recursive: true });
    writeFileSync(
      join(tmpDir, "migrations", "20230101_create_users.ts"),
      `
exports.up = function(knex) {
  return knex.schema.createTable('users', function(table) {
    table.increments('id');
    table.string('name');
  });
};
`,
    );
    writeFileSync(
      join(tmpDir, "migrations", "20230201_drop_users.ts"),
      `
exports.up = function(knex) {
  return knex.schema.dropTable('users');
};
`,
    );
    writeFileSync(
      join(tmpDir, "migrations", "20230301_recreate_users.ts"),
      `
exports.up = function(knex) {
  return knex.schema.createTable('users', function(table) {
    table.increments('id');
    table.string('email').notNullable();
    table.string('role');
  });
};
`,
    );
    const config = {
      ...DEFAULT_CONFIG,
      exclude: [],
      indexers: {
        ...DEFAULT_CONFIG.indexers,
        dbSchema: {
          enabled: true,
          framework: "knex",
          filePattern: "migrations/**/*.ts",
        },
      },
    };
    const output = runDbSchemaIndexer(tmpDir, config);
    expect(output).toContain("1 tables");
    expect(output).toContain("### `users`");
    expect(output).toContain("email");
    expect(output).toContain("role");
    expect(output).not.toContain("| `name");
  });

  it("migration create puis ALTER ADD COLUMN → colonne présente", () => {
    mkdirSync(join(tmpDir, "migrations"), { recursive: true });
    writeFileSync(
      join(tmpDir, "migrations", "20230101_create_users.ts"),
      `
exports.up = function(knex) {
  return knex.schema.createTable('users', function(table) {
    table.increments('id');
    table.string('name');
  });
};
`,
    );
    writeFileSync(
      join(tmpDir, "migrations", "20230201_add_credits.ts"),
      `
exports.up = function(knex) {
  return knex.raw('ALTER TABLE users ADD COLUMN credits INTEGER NOT NULL DEFAULT 0');
};
`,
    );
    const config = {
      ...DEFAULT_CONFIG,
      exclude: [],
      indexers: {
        ...DEFAULT_CONFIG.indexers,
        dbSchema: {
          enabled: true,
          framework: "knex",
          filePattern: "migrations/**/*.ts",
        },
      },
    };
    const output = runDbSchemaIndexer(tmpDir, config);
    expect(output).toContain("### `users`");
    expect(output).toContain("credits");
  });

  it("migration create puis ALTER DROP COLUMN → colonne absente", () => {
    mkdirSync(join(tmpDir, "migrations"), { recursive: true });
    writeFileSync(
      join(tmpDir, "migrations", "20230101_create_users.ts"),
      `
exports.up = function(knex) {
  return knex.schema.createTable('users', function(table) {
    table.increments('id');
    table.string('name');
    table.boolean('is_active');
  });
};
`,
    );
    writeFileSync(
      join(tmpDir, "migrations", "20230202_drop_is_active.ts"),
      `
exports.up = function(knex) {
  return knex.raw('ALTER TABLE users DROP COLUMN is_active');
};
`,
    );
    const config = {
      ...DEFAULT_CONFIG,
      exclude: [],
      indexers: {
        ...DEFAULT_CONFIG.indexers,
        dbSchema: {
          enabled: true,
          framework: "knex",
          filePattern: "migrations/**/*.ts",
        },
      },
    };
    const output = runDbSchemaIndexer(tmpDir, config);
    expect(output).toContain("### `users`");
    expect(output).not.toContain("is_active");
    expect(output).toContain("name");
  });

  it("Drizzle non affecté — tests existants passent toujours", () => {
    mkdirSync(join(tmpDir, "db", "schema"), { recursive: true });
    writeFileSync(
      join(tmpDir, "db", "schema", "users.ts"),
      `
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name').notNull(),
});
`,
    );
    const config = {
      ...DEFAULT_CONFIG,
      exclude: [],
      indexers: {
        ...DEFAULT_CONFIG.indexers,
        dbSchema: {
          enabled: true,
          framework: "drizzle",
          filePattern: "db/schema/**/*.ts",
        },
      },
    };
    const output = runDbSchemaIndexer(tmpDir, config);
    expect(output).toContain("1 tables");
    expect(output).toContain("### `users`");
  });
});
