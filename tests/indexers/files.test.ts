import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { detectRole, extractExports, runFilesIndexer } from "../../src/indexers/files.indexer";
import { DEFAULT_CONFIG } from "../../src/lib/config";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "klix-files-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const baseConfig = DEFAULT_CONFIG;

describe("detectRole", () => {
  it("détecte 'route' pour les fichiers .routes.", () => {
    expect(detectRole("src/users.routes.ts", baseConfig)).toBe("route");
  });

  it("détecte 'service' pour les fichiers .service.", () => {
    expect(detectRole("src/users.service.ts", baseConfig)).toBe("service");
  });

  it("détecte 'db-schema' pour les fichiers .schema.", () => {
    expect(detectRole("src/users.schema.ts", baseConfig)).toBe("db-schema");
  });

  it("détecte 'db-schema' pour les fichiers dans db/schema/", () => {
    expect(detectRole("server/db/schema/users.ts", baseConfig)).toBe("db-schema");
  });

  it("détecte 'hook' pour les fichiers hooks/use-*", () => {
    expect(detectRole("src/hooks/use-users.ts", baseConfig)).toBe("hook");
  });

  it("détecte 'api-client' pour les fichiers .api.", () => {
    expect(detectRole("src/users.api.ts", baseConfig)).toBe("api-client");
  });

  it("détecte 'store' pour les fichiers .store.", () => {
    expect(detectRole("src/auth.store.ts", baseConfig)).toBe("store");
  });

  it("détecte 'types' pour les fichiers .types.", () => {
    expect(detectRole("src/users.types.ts", baseConfig)).toBe("types");
  });

  it("détecte 'plugin' pour les fichiers avec 'plugin'", () => {
    expect(detectRole("src/auth.plugin.ts", baseConfig)).toBe("plugin");
  });

  it("détecte 'util' pour les fichiers avec 'util'", () => {
    expect(detectRole("src/utils/date.ts", baseConfig)).toBe("util");
  });

  it("détecte 'util' pour les fichiers dans lib/", () => {
    expect(detectRole("src/lib/helpers.ts", baseConfig)).toBe("util");
  });

  it("détecte 'component' pour les fichiers .tsx", () => {
    expect(detectRole("src/Button.tsx", baseConfig)).toBe("component");
  });

  it("détecte 'entry' pour les fichiers index.", () => {
    expect(detectRole("src/index.ts", baseConfig)).toBe("entry");
  });

  it("retourne 'module' en dernier recours", () => {
    expect(detectRole("src/helpers.ts", baseConfig)).toBe("module");
  });

  it("applique les rolePatterns personnalisés en priorité", () => {
    const config = {
      ...baseConfig,
      indexers: {
        ...baseConfig.indexers,
        files: {
          enabled: true,
          rolePatterns: { controller: ["*.controller."] },
        },
      },
    };
    expect(detectRole("src/users.controller.ts", config)).toBe("controller");
  });
});

describe("extractExports", () => {
  it("extrait les export function", () => {
    const content = `export function getUser() {}\nexport function createUser() {}`;
    const exports = extractExports(content);
    expect(exports).toContain("getUser");
    expect(exports).toContain("createUser");
  });

  it("extrait les export const", () => {
    const content = `export const API_URL = "http://localhost";\nexport const MAX_ITEMS = 10;`;
    const exports = extractExports(content);
    expect(exports).toContain("API_URL");
    expect(exports).toContain("MAX_ITEMS");
  });

  it("extrait les export class", () => {
    const content = `export class UserService {}`;
    const exports = extractExports(content);
    expect(exports).toContain("UserService");
  });

  it("extrait les export interface", () => {
    const content = `export interface User { id: string; name: string; }`;
    const exports = extractExports(content);
    expect(exports).toContain("User");
  });

  it("extrait les export type", () => {
    const content = `export type UserId = string;`;
    const exports = extractExports(content);
    expect(exports).toContain("UserId");
  });

  it("extrait les export enum", () => {
    const content = `export enum Role { Admin, User }`;
    const exports = extractExports(content);
    expect(exports).toContain("Role");
  });

  it("extrait les export async function", () => {
    const content = `export async function fetchUser() {}`;
    const exports = extractExports(content);
    expect(exports).toContain("fetchUser");
  });

  it("limite à 8 exports maximum", () => {
    const content = Array.from({ length: 12 }, (_, i) => `export const fn${i} = () => {};`).join("\n");
    const exports = extractExports(content);
    expect(exports.length).toBe(8);
  });

  it("déduplique les exports", () => {
    const content = `export function foo() {}\nexport function foo() {}`; // doublon
    const exports = extractExports(content);
    expect(exports.filter((e) => e === "foo").length).toBe(1);
  });

  it("retourne tableau vide si aucun export", () => {
    const content = `const privateVar = 42;\nfunction privateFunc() {}`;
    const exports = extractExports(content);
    expect(exports).toHaveLength(0);
  });
});

describe("runFilesIndexer", () => {
  it("génère un header avec le nom du projet", () => {
    writeFileSync(join(tmpDir, "src.ts"), "export function hello() {}");
    const config = {
      ...baseConfig,
      name: "mon-projet",
      include: ["**/*.ts"],
      exclude: [],
    };
    const output = runFilesIndexer(tmpDir, config);
    expect(output).toContain("# FILES — mon-projet");
  });

  it("inclut le nombre de fichiers indexés", () => {
    mkdirSync(join(tmpDir, "src"));
    writeFileSync(join(tmpDir, "src", "a.ts"), "export const a = 1;");
    writeFileSync(join(tmpDir, "src", "b.ts"), "export const b = 2;");
    const config = { ...baseConfig, include: ["src/**/*.ts"], exclude: [] };
    const output = runFilesIndexer(tmpDir, config);
    expect(output).toContain("2 fichiers indexés");
  });

  it("groupe les fichiers par rôle", () => {
    mkdirSync(join(tmpDir, "src"));
    writeFileSync(join(tmpDir, "src", "users.routes.ts"), "export const r = 1;");
    writeFileSync(join(tmpDir, "src", "users.service.ts"), "export class S {}");
    const config = { ...baseConfig, include: ["src/**/*.ts"], exclude: [] };
    const output = runFilesIndexer(tmpDir, config);
    expect(output).toContain("## route");
    expect(output).toContain("## service");
  });

  it("affiche le nombre de lignes", () => {
    writeFileSync(join(tmpDir, "app.ts"), "line1\nline2\nline3");
    const config = { ...baseConfig, include: ["**/*.ts"], exclude: [] };
    const output = runFilesIndexer(tmpDir, config);
    expect(output).toContain("3");
  });

  it("retourne un résultat valide même sans fichiers", () => {
    const config = { ...baseConfig, include: ["**/*.ts"], exclude: [] };
    const output = runFilesIndexer(tmpDir, config);
    expect(output).toContain("0 fichiers indexés");
  });
});
