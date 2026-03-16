import { describe, it, expect } from "bun:test";
import { drizzleAdapter, parseDrizzleColumn } from "../../src/adapters/db/drizzle.adapter";
import { knexAdapter, parseKnexColumn, extractUpBody } from "../../src/adapters/db/knex.adapter";
import { rawSqlAdapter, parseSqlColumn } from "../../src/adapters/db/raw-sql.adapter";

const FILE = "/fake/schema/users.ts";

describe("parseDrizzleColumn", () => {
  it("parse une colonne simple", () => {
    const col = parseDrizzleColumn("  name: varchar('name'),");
    expect(col?.name).toBe("name");
    expect(col?.type).toBe("varchar");
    expect(col?.isPk).toBe(false);
    expect(col?.isFk).toBe(false);
  });

  it("détecte une clé primaire", () => {
    const col = parseDrizzleColumn("  id: uuid('id').primaryKey().defaultRandom(),");
    expect(col?.isPk).toBe(true);
    expect(col?.nullable).toBe(false);
    expect(col?.hasDefault).toBe(true);
  });

  it("détecte une clé étrangère", () => {
    const col = parseDrizzleColumn("  userId: uuid('user_id').references(() => users.id),");
    expect(col?.isFk).toBe(true);
    expect(col?.references).toBe("users.id");
  });

  it("détecte notNull()", () => {
    const col = parseDrizzleColumn("  email: varchar('email').notNull(),");
    expect(col?.nullable).toBe(false);
  });

  it("nullable par défaut", () => {
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
    expect(parseDrizzleColumn("  // commentaire")).toBeNull();
    expect(parseDrizzleColumn("")).toBeNull();
  });
});

describe("drizzleAdapter", () => {
  it("a les métadonnées correctes", () => {
    expect(drizzleAdapter.id).toBe("drizzle");
    expect(drizzleAdapter.packages).toContain("drizzle-orm");
    expect(drizzleAdapter.defaultFilePattern).toBeTruthy();
  });

  it("extrait une table avec ses colonnes", () => {
    const content = `
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email').notNull(),
});
`;
    const { tables } = drizzleAdapter.extract(content, FILE);
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe("users");
    expect(tables[0].columns.some((c) => c.name === "id" && c.isPk)).toBe(true);
  });

  it("extrait les pgEnums", () => {
    const content = `export const roleEnum = pgEnum('role', ['admin', 'user', 'guest']);`;
    const { enums } = drizzleAdapter.extract(content, FILE);
    expect(enums).toHaveLength(1);
    expect(enums[0].name).toBe("roleEnum");
    expect(enums[0].values).toContain("admin");
  });

  it("extrait plusieurs tables", () => {
    const content = `
export const users = pgTable('users', { id: uuid('id').primaryKey() });
export const posts = pgTable('posts', { id: uuid('id').primaryKey() });
`;
    const { tables } = drizzleAdapter.extract(content, FILE);
    expect(tables).toHaveLength(2);
    expect(tables.map((t) => t.name)).toContain("users");
    expect(tables.map((t) => t.name)).toContain("posts");
  });

  it("extrait les FK avec leur référence", () => {
    const content = `
export const posts = pgTable('posts', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').references(() => users.id),
});
`;
    const { tables } = drizzleAdapter.extract(content, FILE);
    const fkCol = tables[0].columns.find((c) => c.name === "userId");
    expect(fkCol?.isFk).toBe(true);
    expect(fkCol?.references).toBe("users.id");
  });

  it("retourne tableaux vides si pas de tables", () => {
    const { tables, enums } = drizzleAdapter.extract("const x = 42;", FILE);
    expect(tables).toHaveLength(0);
    expect(enums).toHaveLength(0);
  });

  it("extrait une table définie sur plusieurs lignes (nom après saut de ligne)", () => {
    const content = `
export const accountShares = pgTable(
  "account_shares",
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
  }
);
`;
    const { tables } = drizzleAdapter.extract(content, FILE);
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe("account_shares");
    expect(tables[0].varName).toBe("accountShares");
  });

  it("extrait plusieurs tables dont certaines multi-lignes", () => {
    const content = `
export const users = pgTable('users', { id: uuid('id').primaryKey() });

export const accountShares = pgTable(
  "account_shares",
  { userId: uuid('user_id').notNull() }
);
`;
    const { tables } = drizzleAdapter.extract(content, FILE);
    expect(tables).toHaveLength(2);
    expect(tables.map((t) => t.name)).toContain("users");
    expect(tables.map((t) => t.name)).toContain("account_shares");
  });

  it("extrait une table avec indentation par tabulation après pgTable(", () => {
    const content = `export const items = pgTable(\t"items", { id: uuid('id').primaryKey() });`;
    const { tables } = drizzleAdapter.extract(content, FILE);
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe("items");
  });

  it("extrait une table multi-lignes avec 3ème argument (index/contrainte)", () => {
    const content = `
export const accountShares = pgTable(
  "account_shares",
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id').notNull(),
    sharedWithUserId: uuid('shared_with_user_id').notNull(),
  },
  (t) => [unique().on(t.accountId, t.sharedWithUserId)]
);
`;
    const { tables } = drizzleAdapter.extract(content, FILE);
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe("account_shares");
  });
});

describe("parseKnexColumn", () => {
  it("parse une colonne simple", () => {
    const col = parseKnexColumn("    table.string('name')");
    expect(col?.name).toBe("name");
    expect(col?.type).toBe("string");
    expect(col?.isPk).toBe(false);
    expect(col?.isFk).toBe(false);
  });

  it("détecte increments comme clé primaire", () => {
    const col = parseKnexColumn("    table.increments('id')");
    expect(col?.isPk).toBe(true);
    expect(col?.type).toBe("integer");
    expect(col?.nullable).toBe(false);
  });

  it("détecte bigincrements", () => {
    const col = parseKnexColumn("    table.bigincrements('id')");
    expect(col?.isPk).toBe(true);
    expect(col?.type).toBe("biginteger");
  });

  it("détecte notNullable()", () => {
    const col = parseKnexColumn("    table.string('email').notNullable()");
    expect(col?.nullable).toBe(false);
  });

  it("détecte defaultTo()", () => {
    const col = parseKnexColumn("    table.string('status').defaultTo('active')");
    expect(col?.hasDefault).toBe(true);
  });

  it("détecte FK avec inTable", () => {
    const col = parseKnexColumn("    table.integer('user_id').references('id').inTable('users')");
    expect(col?.isFk).toBe(true);
    expect(col?.references).toBe("users.id");
  });

  it("ignore les méthodes timestamps et index", () => {
    expect(parseKnexColumn("    table.timestamps(true, true)")).toBeNull();
    expect(parseKnexColumn("    table.index(['user_id'])")).toBeNull();
  });

  it("retourne null sur ligne non-colonne", () => {
    expect(parseKnexColumn("  // commentaire")).toBeNull();
    expect(parseKnexColumn("")).toBeNull();
  });
});

describe("knexAdapter", () => {
  it("a les métadonnées correctes", () => {
    expect(knexAdapter.id).toBe("knex");
    expect(knexAdapter.packages).toContain("knex");
    expect(knexAdapter.defaultFilePattern).toBeTruthy();
  });

  it("extrait une table simple", () => {
    const content = `
exports.up = function(knex) {
  return knex.schema.createTable('users', function(table) {
    table.increments('id');
    table.string('name').notNullable();
    table.string('email').notNullable();
  });
};
`;
    const { tables } = knexAdapter.extract(content, FILE);
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe("users");
    expect(tables[0].columns.some((c) => c.name === "id" && c.isPk)).toBe(true);
    expect(tables[0].columns.some((c) => c.name === "name")).toBe(true);
  });

  it("extrait plusieurs tables", () => {
    const content = `
exports.up = function(knex) {
  return knex.schema
    .createTable('users', function(table) { table.increments('id'); })
    .createTable('posts', function(table) { table.increments('id'); });
};
`;
    const { tables } = knexAdapter.extract(content, FILE);
    expect(tables).toHaveLength(2);
    expect(tables.map((t) => t.name)).toContain("users");
    expect(tables.map((t) => t.name)).toContain("posts");
  });

  it("extrait les FK avec références", () => {
    const content = `
exports.up = function(knex) {
  return knex.schema.createTable('posts', function(table) {
    table.increments('id');
    table.integer('user_id').references('id').inTable('users');
  });
};
`;
    const { tables } = knexAdapter.extract(content, FILE);
    const fkCol = tables[0].columns.find((c) => c.name === "user_id");
    expect(fkCol?.isFk).toBe(true);
    expect(fkCol?.references).toBe("users.id");
  });

  it("retourne tableaux vides si pas de tables", () => {
    const { tables, enums } = knexAdapter.extract("exports.up = function(knex) {};", FILE);
    expect(tables).toHaveLength(0);
    expect(enums).toHaveLength(0);
  });

  it("détecte dropTable dans up", () => {
    const content = `
exports.up = function(knex) {
  return knex.schema.dropTable('old_users');
};
exports.down = function(knex) {
  return knex.schema.createTable('old_users', function(table) {
    table.increments('id');
  });
};
`;
    const { tables, droppedTables } = knexAdapter.extract(content, FILE);
    expect(tables).toHaveLength(0);
    expect(droppedTables).toEqual(["old_users"]);
  });

  it("détecte dropTableIfExists dans up", () => {
    const content = `
exports.up = function(knex) {
  return knex.schema.dropTableIfExists('legacy');
};
`;
    const { droppedTables } = knexAdapter.extract(content, FILE);
    expect(droppedTables).toEqual(["legacy"]);
  });

  it("détecte createTable + dropTable dans le même fichier", () => {
    const content = `
exports.up = function(knex) {
  return knex.schema
    .dropTable('old_accounts')
    .createTable('accounts', function(table) {
      table.increments('id');
      table.string('name');
    });
};
`;
    const { tables, droppedTables } = knexAdapter.extract(content, FILE);
    expect(droppedTables).toEqual(["old_accounts"]);
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe("accounts");
  });

  it("ignore dropTable dans down (ne doit PAS apparaître dans droppedTables)", () => {
    const content = `
exports.up = function(knex) {
  return knex.schema.createTable('users', function(table) {
    table.increments('id');
    table.string('name');
  });
};
exports.down = function(knex) {
  return knex.schema.dropTable('users');
};
`;
    const { tables, droppedTables } = knexAdapter.extract(content, FILE);
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe("users");
    expect(droppedTables).toHaveLength(0);
  });

  it("retourne droppedTables vide quand pas de drops", () => {
    const content = `
exports.up = function(knex) {
  return knex.schema.createTable('posts', function(table) {
    table.increments('id');
  });
};
`;
    const { droppedTables } = knexAdapter.extract(content, FILE);
    expect(droppedTables).toHaveLength(0);
  });
});

describe("parseSqlColumn", () => {
  it("parse une colonne simple (SERIAL PRIMARY KEY)", () => {
    const col = parseSqlColumn("  id SERIAL PRIMARY KEY");
    expect(col?.name).toBe("id");
    expect(col?.type).toBe("serial");
    expect(col?.isPk).toBe(true);
    expect(col?.nullable).toBe(false);
  });

  it("normalise le type VARCHAR(255) → varchar", () => {
    const col = parseSqlColumn("  email VARCHAR(255)");
    expect(col?.type).toBe("varchar");
  });

  it("NOT NULL → nullable: false", () => {
    const col = parseSqlColumn("  email VARCHAR(255) NOT NULL");
    expect(col?.nullable).toBe(false);
  });

  it("DEFAULT → hasDefault: true", () => {
    const col = parseSqlColumn("  status VARCHAR(50) DEFAULT 'active'");
    expect(col?.hasDefault).toBe(true);
  });

  it("REFERENCES users(id) → isFk: true + references", () => {
    const col = parseSqlColumn("  user_id INTEGER REFERENCES users(id)");
    expect(col?.isFk).toBe(true);
    expect(col?.references).toBe("users.id");
  });

  it("REFERENCES ... ON DELETE CASCADE → parse OK", () => {
    const col = parseSqlColumn("  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE");
    expect(col?.isFk).toBe(true);
    expect(col?.references).toBe("users.id");
  });

  it("CONSTRAINT ... → null", () => {
    expect(parseSqlColumn("  CONSTRAINT pk_users PRIMARY KEY (id)")).toBeNull();
  });

  it("PRIMARY KEY (...) → null", () => {
    expect(parseSqlColumn("  PRIMARY KEY (id, name)")).toBeNull();
  });

  it("FOREIGN KEY → null", () => {
    expect(parseSqlColumn("  FOREIGN KEY (user_id) REFERENCES users(id)")).toBeNull();
  });

  it("ligne vide → null", () => {
    expect(parseSqlColumn("")).toBeNull();
    expect(parseSqlColumn("   ")).toBeNull();
  });
});

describe("rawSqlAdapter", () => {
  const FILE = "/fake/migrations/001_init.sql";

  it("a les métadonnées correctes", () => {
    expect(rawSqlAdapter.id).toBe("raw-sql");
    expect(rawSqlAdapter.packages).toEqual([]);
    expect(rawSqlAdapter.defaultFilePattern).toBeTruthy();
  });

  it("extrait une table simple avec colonnes", () => {
    const sql = `
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL
);
`;
    const { tables } = rawSqlAdapter.extract(sql, FILE);
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe("users");
    expect(tables[0].columns.some((c) => c.name === "id" && c.isPk)).toBe(true);
    expect(tables[0].columns.some((c) => c.name === "name" && !c.nullable)).toBe(true);
  });

  it("extrait plusieurs tables dans un fichier", () => {
    const sql = `
CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE posts (id SERIAL PRIMARY KEY, title TEXT NOT NULL);
`;
    const { tables } = rawSqlAdapter.extract(sql, FILE);
    expect(tables).toHaveLength(2);
    expect(tables.map((t) => t.name)).toContain("users");
    expect(tables.map((t) => t.name)).toContain("posts");
  });

  it("IF NOT EXISTS → nom correct", () => {
    const sql = `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY);`;
    const { tables } = rawSqlAdapter.extract(sql, FILE);
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe("users");
  });

  it("préfixe schéma public.users → name: users", () => {
    const sql = `CREATE TABLE public.users (id SERIAL PRIMARY KEY);`;
    const { tables } = rawSqlAdapter.extract(sql, FILE);
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe("users");
  });

  it("CREATE TYPE ... AS ENUM → extrait l'enum", () => {
    const sql = `CREATE TYPE role AS ENUM ('admin', 'user', 'guest');`;
    const { enums } = rawSqlAdapter.extract(sql, FILE);
    expect(enums).toHaveLength(1);
    expect(enums[0].name).toBe("role");
    expect(enums[0].values).toContain("admin");
    expect(enums[0].values).toContain("guest");
  });

  it("DROP TABLE → droppedTables", () => {
    const sql = `DROP TABLE old_users;`;
    const { droppedTables } = rawSqlAdapter.extract(sql, FILE);
    expect(droppedTables).toEqual(["old_users"]);
  });

  it("DROP TABLE IF EXISTS → droppedTables", () => {
    const sql = `DROP TABLE IF EXISTS legacy_data;`;
    const { droppedTables } = rawSqlAdapter.extract(sql, FILE);
    expect(droppedTables).toEqual(["legacy_data"]);
  });

  it("commentaires -- sont ignorés", () => {
    const sql = `
-- This is a comment
CREATE TABLE users (
  id SERIAL PRIMARY KEY -- inline comment
);
`;
    const { tables } = rawSqlAdapter.extract(sql, FILE);
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe("users");
  });

  it("commentaires /* */ sont ignorés", () => {
    const sql = `
/* block comment */
CREATE TABLE users (
  id SERIAL PRIMARY KEY /* another comment */
);
`;
    const { tables } = rawSqlAdapter.extract(sql, FILE);
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe("users");
  });

  it("fichier vide → tableaux vides", () => {
    const { tables, enums, droppedTables } = rawSqlAdapter.extract("", FILE);
    expect(tables).toHaveLength(0);
    expect(enums).toHaveLength(0);
    expect(droppedTables).toHaveLength(0);
  });
});

describe("knexAdapter avec knex.raw()", () => {
  const FILE = "/fake/migrations/001_init.ts";

  it("extrait une table depuis un template literal", () => {
    const content = `
exports.up = function(knex) {
  return knex.raw(\`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL
    )
  \`);
};
`;
    const { tables } = knexAdapter.extract(content, FILE);
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe("users");
  });

  it("extrait depuis plusieurs knex.raw() dans un fichier", () => {
    const content = `
exports.up = async function(knex) {
  await knex.raw(\`CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT NOT NULL)\`);
  await knex.raw(\`CREATE TABLE posts (id SERIAL PRIMARY KEY, title TEXT NOT NULL)\`);
};
`;
    const { tables } = knexAdapter.extract(content, FILE);
    expect(tables).toHaveLength(2);
    expect(tables.map((t) => t.name)).toContain("users");
    expect(tables.map((t) => t.name)).toContain("posts");
  });

  it("DROP TABLE dans knex.raw() → droppedTables", () => {
    const content = `
exports.up = function(knex) {
  return knex.raw(\`DROP TABLE old_users\`);
};
`;
    const { droppedTables } = knexAdapter.extract(content, FILE);
    expect(droppedTables).toContain("old_users");
  });

  it("knex.raw() dans down est ignoré", () => {
    const content = `
exports.up = function(knex) {
  return knex.schema.createTable('users', function(table) {
    table.increments('id');
  });
};
exports.down = function(knex) {
  return knex.raw(\`DROP TABLE users\`);
};
`;
    const { tables, droppedTables } = knexAdapter.extract(content, FILE);
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe("users");
    expect(droppedTables).toHaveLength(0);
  });

  it("coexistence createTable + knex.raw() dans le même fichier", () => {
    const content = `
exports.up = async function(knex) {
  await knex.schema.createTable('users', function(table) {
    table.increments('id');
    table.string('name').notNullable();
  });
  await knex.raw(\`CREATE TABLE profiles (id SERIAL PRIMARY KEY, bio TEXT)\`);
};
`;
    const { tables } = knexAdapter.extract(content, FILE);
    expect(tables).toHaveLength(2);
    expect(tables.map((t) => t.name)).toContain("users");
    expect(tables.map((t) => t.name)).toContain("profiles");
  });
});

describe("extractUpBody", () => {
  it("extrait le corps de exports.up = function", () => {
    const content = `
exports.up = function(knex) {
  return knex.schema.createTable('users', function(table) {
    table.increments('id');
  });
};
exports.down = function(knex) {
  return knex.schema.dropTable('users');
};
`;
    const body = extractUpBody(content);
    expect(body).toContain("createTable");
    expect(body).not.toContain("dropTable");
  });

  it("extrait le corps de export async function up", () => {
    const content = `
export async function up(knex) {
  await knex.schema.createTable('items', (table) => {
    table.increments('id');
  });
}
export async function down(knex) {
  await knex.schema.dropTable('items');
}
`;
    const body = extractUpBody(content);
    expect(body).toContain("createTable");
    expect(body).not.toContain("dropTable");
  });

  it("extrait le corps de export const up = async", () => {
    const content = `
export const up = async (knex) => {
  await knex.schema.createTable('orders', (table) => {
    table.increments('id');
  });
};
export const down = async (knex) => {
  await knex.schema.dropTable('orders');
};
`;
    const body = extractUpBody(content);
    expect(body).toContain("createTable");
    expect(body).not.toContain("dropTable");
  });

  it("retourne le contenu complet si aucun pattern up trouvé", () => {
    const content = `knex.schema.createTable('x', (t) => { t.increments('id'); });`;
    const body = extractUpBody(content);
    expect(body).toBe(content);
  });
});
