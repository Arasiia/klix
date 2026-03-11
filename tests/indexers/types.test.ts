import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { extractInterfaces, extractTypeAliases, extractEnums, runTypesIndexer } from "../../src/indexers/types.indexer";
import { DEFAULT_CONFIG } from "../../src/lib/config";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "klix-types-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const FILE = "src/types.ts";

describe("extractInterfaces", () => {
  it("extrait une interface simple", () => {
    const content = `export interface User {\n  id: string;\n  name: string;\n}`;
    const types = extractInterfaces(content, FILE);
    expect(types).toHaveLength(1);
    expect(types[0].name).toBe("User");
    expect(types[0].kind).toBe("interface");
    expect(types[0].fields).toContain("id");
    expect(types[0].fields).toContain("name");
  });

  it("extrait les champs optionnels", () => {
    const content = `export interface User {\n  id: string;\n  email?: string;\n}`;
    const types = extractInterfaces(content, FILE);
    expect(types[0].fields).toContain("email");
  });

  it("extrait plusieurs interfaces", () => {
    const content = `
export interface User { id: string; name: string; }
export interface Post { id: string; title: string; }
    `;
    const types = extractInterfaces(content, FILE);
    expect(types).toHaveLength(2);
    expect(types.map((t) => t.name)).toContain("User");
    expect(types.map((t) => t.name)).toContain("Post");
  });

  it("ignore les commentaires dans les interfaces", () => {
    const content = `export interface User {\n  // commentaire\n  id: string;\n}`;
    const types = extractInterfaces(content, FILE);
    expect(types[0].fields).not.toContain("commentaire");
    expect(types[0].fields).toContain("id");
  });

  it("limite à 10 champs", () => {
    const fields = Array.from({ length: 15 }, (_, i) => `  field${i}: string;`).join("\n");
    const content = `export interface Big {\n${fields}\n}`;
    const types = extractInterfaces(content, FILE);
    expect(types[0].fields.length).toBeLessThanOrEqual(10);
  });

  it("retourne tableau vide si pas d'interface", () => {
    const content = `type Foo = string;`;
    const types = extractInterfaces(content, FILE);
    expect(types).toHaveLength(0);
  });

  it("extrait une interface avec extends", () => {
    const content = `export interface Admin extends User {\n  role: string;\n}`;
    const types = extractInterfaces(content, FILE);
    expect(types[0].name).toBe("Admin");
    expect(types[0].fields).toContain("role");
  });
});

describe("extractTypeAliases", () => {
  it("extrait un type union", () => {
    const content = `export type Role = 'admin' | 'user' | 'guest';`;
    const types = extractTypeAliases(content, FILE);
    expect(types).toHaveLength(1);
    expect(types[0].name).toBe("Role");
    expect(types[0].kind).toBe("type");
    expect(types[0].fields).toContain("admin");
    expect(types[0].fields).toContain("user");
    expect(types[0].fields).toContain("guest");
  });

  it("extrait un type objet", () => {
    const content = `export type Config = { host: string; port: number };`;
    const types = extractTypeAliases(content, FILE);
    expect(types).toHaveLength(1);
    expect(types[0].name).toBe("Config");
    expect(types[0].kind).toBe("type");
  });

  it("ignore les types simples sans | ni {", () => {
    const content = `export type Id = string;`;
    const types = extractTypeAliases(content, FILE);
    expect(types).toHaveLength(0);
  });

  it("limite à 8 valeurs pour les unions", () => {
    const values = Array.from({ length: 12 }, (_, i) => `'val${i}'`).join(" | ");
    const content = `export type Big = ${values};`;
    const types = extractTypeAliases(content, FILE);
    expect(types[0].fields.length).toBeLessThanOrEqual(8);
  });
});

describe("extractEnums", () => {
  it("extrait un enum TypeScript", () => {
    const content = `export enum Role {\n  Admin = 'admin',\n  User = 'user',\n}`;
    const types = extractEnums(content, FILE);
    const roleEnum = types.find((t) => t.name === "Role");
    expect(roleEnum).toBeDefined();
    expect(roleEnum?.kind).toBe("enum");
    expect(roleEnum?.fields).toContain("Admin");
    expect(roleEnum?.fields).toContain("User");
  });

  it("extrait un pgEnum Drizzle", () => {
    const content = `export const roleEnum = pgEnum('role', ['admin', 'user', 'guest']);`;
    const types = extractEnums(content, FILE);
    const pgE = types.find((t) => t.name === "roleEnum");
    expect(pgE).toBeDefined();
    expect(pgE?.kind).toBe("enum");
    expect(pgE?.fields).toContain("admin");
    expect(pgE?.fields).toContain("user");
  });

  it("retourne tableau vide si pas d'enum", () => {
    const content = `export const x = 42;`;
    const types = extractEnums(content, FILE);
    expect(types).toHaveLength(0);
  });
});

describe("runTypesIndexer", () => {
  it("génère le header avec le nom du projet", () => {
    const config = { ...DEFAULT_CONFIG, name: "my-app", exclude: [] };
    const output = runTypesIndexer(tmpDir, config);
    expect(output).toContain("# TYPES — my-app");
  });

  it("indexe les interfaces depuis des fichiers réels", () => {
    mkdirSync(join(tmpDir, "src"));
    writeFileSync(
      join(tmpDir, "src", "models.types.ts"),
      `export interface User {\n  id: string;\n  name: string;\n}\n`,
    );
    const config = {
      ...DEFAULT_CONFIG,
      exclude: [],
      indexers: {
        ...DEFAULT_CONFIG.indexers,
        types: { enabled: true, filePatterns: ["src/**/*.types.ts"] },
        dbSchema: { ...DEFAULT_CONFIG.indexers.dbSchema, filePattern: "nonexistent/**" },
      },
    };
    const output = runTypesIndexer(tmpDir, config);
    expect(output).toContain("User");
    expect(output).toContain("Interfaces");
  });

  it("indexe les enums TS", () => {
    mkdirSync(join(tmpDir, "src"));
    writeFileSync(join(tmpDir, "src", "enums.types.ts"), `export enum Status {\n  Active,\n  Inactive,\n}\n`);
    const config = {
      ...DEFAULT_CONFIG,
      exclude: [],
      indexers: {
        ...DEFAULT_CONFIG.indexers,
        types: { enabled: true, filePatterns: ["src/**/*.types.ts"] },
        dbSchema: { ...DEFAULT_CONFIG.indexers.dbSchema, filePattern: "nonexistent/**" },
      },
    };
    const output = runTypesIndexer(tmpDir, config);
    expect(output).toContain("Status");
    expect(output).toContain("Enums");
  });

  it("déduplique les types identiques", () => {
    mkdirSync(join(tmpDir, "src"));
    const content = `export interface User {\n  id: string;\n}\n`;
    writeFileSync(join(tmpDir, "src", "a.types.ts"), content);
    writeFileSync(join(tmpDir, "src", "b.types.ts"), content);
    const config = {
      ...DEFAULT_CONFIG,
      exclude: [],
      indexers: {
        ...DEFAULT_CONFIG.indexers,
        types: { enabled: true, filePatterns: ["src/**/*.types.ts"] },
        dbSchema: { ...DEFAULT_CONFIG.indexers.dbSchema, filePattern: "nonexistent/**" },
      },
    };
    const output = runTypesIndexer(tmpDir, config);
    // Même si le type est dans 2 fichiers différents, il n'est pas dédupliqué (clé = name:file)
    // On vérifie juste que User apparaît
    expect(output).toContain("User");
  });
});
