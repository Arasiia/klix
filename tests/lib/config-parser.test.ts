import { describe, it, expect } from "bun:test";
import {
  parseKnexfileConfig,
  parseDrizzleConfig,
  parseApiPrefix,
} from "../../src/lib/config-parser";

/* ------------------------------------------------------------------ */
/*  parseKnexfileConfig                                                */
/* ------------------------------------------------------------------ */

describe("parseKnexfileConfig", () => {
  it("extrait migrations directory (string literal)", () => {
    const content = `
module.exports = {
  client: 'pg',
  migrations: {
    directory: './db/migrations',
    tableName: 'knex_migrations',
  },
};`;
    const result = parseKnexfileConfig(content);
    expect(result.migrationsDir).toBe("db/migrations");
  });

  it("extrait migrations directory (path.join)", () => {
    const content = `
module.exports = {
  client: 'pg',
  migrations: {
    directory: path.join(__dirname, 'migrations'),
  },
};`;
    const result = parseKnexfileConfig(content);
    expect(result.migrationsDir).toBe("migrations");
  });

  it("extrait seeds directory", () => {
    const content = `
module.exports = {
  client: 'pg',
  migrations: {
    directory: './migrations',
  },
  seeds: {
    directory: './db/seeds',
  },
};`;
    const result = parseKnexfileConfig(content);
    expect(result.migrationsDir).toBe("migrations");
    expect(result.seedsDir).toBe("db/seeds");
  });

  it("retourne vide si pas de match", () => {
    const content = `
module.exports = {
  client: 'pg',
  connection: { host: 'localhost' },
};`;
    const result = parseKnexfileConfig(content);
    expect(result.migrationsDir).toBeUndefined();
    expect(result.seedsDir).toBeUndefined();
  });

  it("gère les guillemets doubles", () => {
    const content = `
module.exports = {
  migrations: {
    directory: "./custom-migrations",
  },
};`;
    const result = parseKnexfileConfig(content);
    expect(result.migrationsDir).toBe("custom-migrations");
  });
});

/* ------------------------------------------------------------------ */
/*  parseDrizzleConfig                                                 */
/* ------------------------------------------------------------------ */

describe("parseDrizzleConfig", () => {
  it("extrait schema path (string literal)", () => {
    const content = `
export default defineConfig({
  schema: './src/db/schema',
  out: './drizzle',
});`;
    const result = parseDrizzleConfig(content);
    expect(result.schemaPath).toBe("src/db/schema");
  });

  it("extrait schema path (array — prend le premier)", () => {
    const content = `
export default defineConfig({
  schema: ['./src/db/schema/users.ts', './src/db/schema/orders.ts'],
  out: './drizzle',
});`;
    const result = parseDrizzleConfig(content);
    expect(result.schemaPath).toBe("src/db/schema/users.ts");
  });

  it("retourne vide si pas de match", () => {
    const content = `
export default defineConfig({
  out: './drizzle',
});`;
    const result = parseDrizzleConfig(content);
    expect(result.schemaPath).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  parseApiPrefix                                                     */
/* ------------------------------------------------------------------ */

describe("parseApiPrefix", () => {
  it("détecte app.use('/api', ...)", () => {
    const content = `
const app = express();
app.use('/api', router);
`;
    expect(parseApiPrefix(content)).toBe("/api");
  });

  it("détecte app.use('/api/v1', ...)", () => {
    const content = `
app.use('/api/v1', routes);
`;
    expect(parseApiPrefix(content)).toBe("/api/v1");
  });

  it("retourne undefined si pas de match", () => {
    const content = `
const app = express();
app.use(cors());
app.listen(3000);
`;
    expect(parseApiPrefix(content)).toBeUndefined();
  });

  it("détecte avec guillemets doubles", () => {
    const content = `app.use("/api", router);`;
    expect(parseApiPrefix(content)).toBe("/api");
  });
});
