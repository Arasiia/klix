import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { loadConfig, detectFramework, DEFAULT_CONFIG } from "../../src/lib/config";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "klix-config-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("loadConfig", () => {
  it("retourne la config par défaut si pas de fichier", () => {
    const config = loadConfig(tmpDir);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it("charge et fusionne une config partielle", () => {
    writeFileSync(join(tmpDir, "klix.config.json"), JSON.stringify({ name: "mon-projet", version: "1" }));
    const config = loadConfig(tmpDir);
    expect(config.name).toBe("mon-projet");
    expect(config.output).toBe(DEFAULT_CONFIG.output); // valeur par défaut conservée
  });

  it("fusionne les indexers profondément", () => {
    writeFileSync(
      join(tmpDir, "klix.config.json"),
      JSON.stringify({
        indexers: {
          routes: { framework: "express" },
        },
      }),
    );
    const config = loadConfig(tmpDir);
    expect(config.indexers.routes.framework).toBe("express");
    expect(config.indexers.routes.apiPrefix).toBe(DEFAULT_CONFIG.indexers.routes.apiPrefix);
    expect(config.indexers.files.enabled).toBe(true); // non touché
  });

  it("remplace les tableaux (include/exclude) correctement", () => {
    writeFileSync(join(tmpDir, "klix.config.json"), JSON.stringify({ include: ["app/**/*.ts"] }));
    const config = loadConfig(tmpDir);
    expect(config.include).toEqual(["app/**/*.ts"]); // remplacé, pas fusionné
  });

  it("retourne la config par défaut si JSON invalide", () => {
    writeFileSync(join(tmpDir, "klix.config.json"), "{ invalid json }");
    const config = loadConfig(tmpDir);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it("charge les conventions Claude", () => {
    writeFileSync(
      join(tmpDir, "klix.config.json"),
      JSON.stringify({ claude: { conventions: ["Toujours typer les retours"] } }),
    );
    const config = loadConfig(tmpDir);
    expect(config.claude.conventions).toEqual(["Toujours typer les retours"]);
    expect(config.claude.claudeMdPath).toBe("CLAUDE.md"); // défaut conservé
  });
});

describe("detectFramework", () => {
  it("retourne none/none/none si pas de package.json", () => {
    const result = detectFramework(tmpDir);
    expect(result).toEqual({ routes: "none", dbSchema: "none", hooks: "none" });
  });

  it("détecte Elysia comme framework de routes", () => {
    writeFileSync(join(tmpDir, "package.json"), JSON.stringify({ dependencies: { elysia: "^1.0.0" } }));
    const result = detectFramework(tmpDir);
    expect(result.routes).toBe("elysia");
  });

  it("détecte Express comme framework de routes", () => {
    writeFileSync(join(tmpDir, "package.json"), JSON.stringify({ dependencies: { express: "^4.18.0" } }));
    const result = detectFramework(tmpDir);
    expect(result.routes).toBe("express");
  });

  it("retourne 'none' pour un framework sans adaptateur (ex: Fastify)", () => {
    // Fastify n'a pas d'adaptateur klix → détection retourne "none"
    writeFileSync(join(tmpDir, "package.json"), JSON.stringify({ dependencies: { fastify: "^4.0.0" } }));
    const result = detectFramework(tmpDir);
    expect(result.routes).toBe("none");
  });

  it("détecte Drizzle comme ORM", () => {
    writeFileSync(join(tmpDir, "package.json"), JSON.stringify({ dependencies: { "drizzle-orm": "^0.30.0" } }));
    const result = detectFramework(tmpDir);
    expect(result.dbSchema).toBe("drizzle");
  });

  it("retourne 'none' pour un ORM sans adaptateur (ex: Prisma)", () => {
    // Prisma n'a pas d'adaptateur klix → retourne 'none'
    writeFileSync(join(tmpDir, "package.json"), JSON.stringify({ dependencies: { "@prisma/client": "^5.0.0" } }));
    const result = detectFramework(tmpDir);
    expect(result.dbSchema).toBe("none");
  });

  it("détecte TanStack Query pour les hooks", () => {
    writeFileSync(
      join(tmpDir, "package.json"),
      JSON.stringify({ dependencies: { "@tanstack/react-query": "^5.0.0" } }),
    );
    const result = detectFramework(tmpDir);
    expect(result.hooks).toBe("tanstack-query");
  });

  it("retourne 'none' pour une lib hooks sans adaptateur (ex: SWR)", () => {
    // SWR n'a pas d'adaptateur klix → retourne 'none'
    writeFileSync(join(tmpDir, "package.json"), JSON.stringify({ dependencies: { swr: "^2.0.0" } }));
    const result = detectFramework(tmpDir);
    expect(result.hooks).toBe("none");
  });

  it("détecte depuis devDependencies aussi", () => {
    writeFileSync(join(tmpDir, "package.json"), JSON.stringify({ devDependencies: { elysia: "^1.0.0" } }));
    const result = detectFramework(tmpDir);
    expect(result.routes).toBe("elysia");
  });

  it("détecte une stack complète elysia+drizzle+tanstack", () => {
    writeFileSync(
      join(tmpDir, "package.json"),
      JSON.stringify({
        dependencies: {
          elysia: "^1.0.0",
          "drizzle-orm": "^0.30.0",
          "@tanstack/react-query": "^5.0.0",
        },
      }),
    );
    const result = detectFramework(tmpDir);
    expect(result.routes).toBe("elysia");
    expect(result.dbSchema).toBe("drizzle");
    expect(result.hooks).toBe("tanstack-query");
  });
});
