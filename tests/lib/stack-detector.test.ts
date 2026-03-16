import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  detectStack,
  detectFrameworksFromStack,
  loadDepsFromPackageJson,
  buildStackMarkdown,
  isFrontendOnlyProject,
  LIB_REGISTRY,
} from "../../src/lib/stack-detector";
import { ROUTE_ADAPTERS, DB_ADAPTERS, HOOKS_ADAPTERS } from "../../src/adapters";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "klix-stack-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("LIB_REGISTRY", () => {
  it("contient des entrées pour les frameworks principaux", () => {
    const pkgs = LIB_REGISTRY.map((l) => l.pkg);
    expect(pkgs).toContain("elysia");
    expect(pkgs).toContain("express");
    expect(pkgs).toContain("drizzle-orm");
    expect(pkgs).toContain("@prisma/client");
    expect(pkgs).toContain("@tanstack/react-query");
    expect(pkgs).toContain("zod");
    expect(pkgs).toContain("react");
    expect(pkgs).toContain("next");
  });

  it("chaque entrée a un pkg, un label et une catégorie", () => {
    for (const entry of LIB_REGISTRY) {
      expect(entry.pkg).toBeTruthy();
      expect(entry.label).toBeTruthy();
      expect(entry.category).toBeTruthy();
    }
  });

  it("les adaptateurs de routes couvrent elysia et express", () => {
    const routePkgs = ROUTE_ADAPTERS.flatMap((a) => a.packages);
    expect(routePkgs).toContain("elysia");
    expect(routePkgs).toContain("express");
  });

  it("les adaptateurs DB couvrent drizzle", () => {
    const dbPkgs = DB_ADAPTERS.flatMap((a) => a.packages);
    expect(dbPkgs).toContain("drizzle-orm");
  });

  it("les adaptateurs hooks couvrent tanstack-query", () => {
    const hookPkgs = HOOKS_ADAPTERS.flatMap((a) => a.packages);
    expect(hookPkgs).toContain("@tanstack/react-query");
  });
});

describe("detectStack", () => {
  it("détecte les libs présentes dans les deps", () => {
    const deps = { elysia: "^1.0.0", zod: "^3.22.0" };
    const stack = detectStack(deps);
    expect(stack.some((l) => l.pkg === "elysia")).toBe(true);
    expect(stack.some((l) => l.pkg === "zod")).toBe(true);
  });

  it("ignore les libs absentes des deps", () => {
    const deps = { elysia: "^1.0.0" };
    const stack = detectStack(deps);
    expect(stack.some((l) => l.pkg === "express")).toBe(false);
  });

  it("inclut la version dans les résultats", () => {
    const deps = { elysia: "^1.2.3" };
    const stack = detectStack(deps);
    const elysia = stack.find((l) => l.pkg === "elysia");
    expect(elysia?.version).toBe("^1.2.3");
  });

  it("retourne tableau vide pour des deps vides", () => {
    expect(detectStack({})).toHaveLength(0);
  });

  it("ignore les packages inconnus du registre", () => {
    const deps = { "some-unknown-pkg": "^1.0.0" };
    const stack = detectStack(deps);
    expect(stack).toHaveLength(0);
  });
});

describe("detectFrameworksFromStack", () => {
  it("détecte elysia pour les routes", () => {
    const result = detectFrameworksFromStack({ elysia: "^1.0.0" });
    expect(result.routes).toBe("elysia");
  });

  it("détecte drizzle pour la DB", () => {
    const result = detectFrameworksFromStack({ "drizzle-orm": "^0.30.0" });
    expect(result.db).toBe("drizzle");
  });

  it("détecte tanstack-query pour les hooks", () => {
    const result = detectFrameworksFromStack({ "@tanstack/react-query": "^5.0.0" });
    expect(result.hooks).toBe("tanstack-query");
  });

  it("retourne des valeurs par défaut si rien n'est détecté", () => {
    const result = detectFrameworksFromStack({});
    expect(result.routes).toBe("none");
    expect(result.db).toBe("none");
    expect(result.hooks).toBe("none");
  });

  it("gère une stack complète elysia+drizzle+tanstack", () => {
    const result = detectFrameworksFromStack({
      elysia: "^1.0.0",
      "drizzle-orm": "^0.30.0",
      "@tanstack/react-query": "^5.0.0",
    });
    expect(result.routes).toBe("elysia");
    expect(result.db).toBe("drizzle");
    expect(result.hooks).toBe("tanstack-query");
  });

  it("retourne 'none' pour un framework sans adaptateur", () => {
    // Fastify n'a pas d'adaptateur klix → retourne "none"
    const result = detectFrameworksFromStack({ fastify: "^4.0.0" });
    expect(result.routes).toBe("none");
  });
});

describe("loadDepsFromPackageJson", () => {
  it("retourne objet vide si pas de package.json", () => {
    const deps = loadDepsFromPackageJson(tmpDir);
    expect(deps).toEqual({});
  });

  it("fusionne dependencies et devDependencies", () => {
    writeFileSync(
      join(tmpDir, "package.json"),
      JSON.stringify({
        dependencies: { elysia: "^1.0.0" },
        devDependencies: { vitest: "^1.0.0" },
      }),
    );
    const deps = loadDepsFromPackageJson(tmpDir);
    expect(deps["elysia"]).toBe("^1.0.0");
    expect(deps["vitest"]).toBe("^1.0.0");
  });

  it("retourne objet vide si JSON invalide", () => {
    writeFileSync(join(tmpDir, "package.json"), "{ invalid }");
    const deps = loadDepsFromPackageJson(tmpDir);
    expect(deps).toEqual({});
  });
});

describe("isFrontendOnlyProject", () => {
  it("react + vite → true", () => {
    expect(isFrontendOnlyProject({ react: "^18.0.0", vite: "^5.0.0" })).toBe(true);
  });

  it("vue seul → true", () => {
    expect(isFrontendOnlyProject({ vue: "^3.0.0" })).toBe(true);
  });

  it("svelte seul → true", () => {
    expect(isFrontendOnlyProject({ svelte: "^4.0.0" })).toBe(true);
  });

  it("react + express → false (backend présent)", () => {
    expect(isFrontendOnlyProject({ react: "^18.0.0", express: "^4.0.0" })).toBe(false);
  });

  it("react + elysia → false (backend présent)", () => {
    expect(isFrontendOnlyProject({ react: "^18.0.0", elysia: "^1.0.0" })).toBe(false);
  });

  it("react + next → false (framework hybride SSR)", () => {
    expect(isFrontendOnlyProject({ react: "^18.0.0", next: "^14.0.0" })).toBe(false);
  });

  it("react + nuxt → false (framework hybride SSR)", () => {
    expect(isFrontendOnlyProject({ react: "^18.0.0", nuxt: "^3.0.0" })).toBe(false);
  });

  it("deps vides → false", () => {
    expect(isFrontendOnlyProject({})).toBe(false);
  });

  it("express seul (sans frontend) → false", () => {
    expect(isFrontendOnlyProject({ express: "^4.0.0" })).toBe(false);
  });

  it("react + tanstack-query + tailwind → true (pas de backend)", () => {
    expect(
      isFrontendOnlyProject({
        react: "^18.0.0",
        "@tanstack/react-query": "^5.0.0",
        tailwindcss: "^3.0.0",
      }),
    ).toBe(true);
  });
});

describe("buildStackMarkdown", () => {
  it("retourne une chaîne vide si pas de package.json", () => {
    const md = buildStackMarkdown(tmpDir);
    expect(md).toBe("");
  });

  it("retourne une chaîne vide si aucune lib connue", () => {
    writeFileSync(join(tmpDir, "package.json"), JSON.stringify({ dependencies: { "some-unknown-lib": "^1.0.0" } }));
    const md = buildStackMarkdown(tmpDir);
    expect(md).toBe("");
  });

  it("génère un tableau markdown avec les libs détectées", () => {
    writeFileSync(join(tmpDir, "package.json"), JSON.stringify({ dependencies: { elysia: "^1.0.0", zod: "^3.22.0" } }));
    const md = buildStackMarkdown(tmpDir);
    expect(md).toContain("## Stack Technique");
    expect(md).toContain("| Catégorie | Lib | Version |");
    expect(md).toContain("Elysia");
    expect(md).toContain("^1.0.0");
    expect(md).toContain("Zod");
  });

  it("groupe par catégorie dans l'ordre défini", () => {
    writeFileSync(
      join(tmpDir, "package.json"),
      JSON.stringify({
        dependencies: {
          zod: "^3.0.0",
          elysia: "^1.0.0",
          vitest: "^1.0.0",
        },
      }),
    );
    const md = buildStackMarkdown(tmpDir);
    const backendIdx = md.indexOf("Backend");
    const validationIdx = md.indexOf("Validation");
    const testingIdx = md.indexOf("Testing");
    expect(backendIdx).toBeLessThan(validationIdx);
    expect(validationIdx).toBeLessThan(testingIdx);
  });
});
