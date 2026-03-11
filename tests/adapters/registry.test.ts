import { describe, it, expect } from "bun:test";
import {
  ROUTE_ADAPTERS,
  DB_ADAPTERS,
  HOOKS_ADAPTERS,
  LANGUAGE_ADAPTERS,
  findRouteAdapter,
  findDbAdapter,
  findHooksAdapter,
  findLanguageAdapter,
  detectRouteFramework,
  detectDbFramework,
  detectHooksFramework,
} from "../../src/adapters";

describe("Registre des adaptateurs", () => {
  it("ROUTE_ADAPTERS contient elysia, express et koa", () => {
    expect(ROUTE_ADAPTERS.map((a) => a.id)).toContain("elysia");
    expect(ROUTE_ADAPTERS.map((a) => a.id)).toContain("express");
    expect(ROUTE_ADAPTERS.map((a) => a.id)).toContain("koa");
  });

  it("DB_ADAPTERS contient drizzle et knex", () => {
    expect(DB_ADAPTERS.map((a) => a.id)).toContain("drizzle");
    expect(DB_ADAPTERS.map((a) => a.id)).toContain("knex");
  });

  it("HOOKS_ADAPTERS contient tanstack-query", () => {
    expect(HOOKS_ADAPTERS.map((a) => a.id)).toContain("tanstack-query");
  });

  it("LANGUAGE_ADAPTERS contient typescript et javascript", () => {
    expect(LANGUAGE_ADAPTERS.map((a) => a.id)).toContain("typescript");
    expect(LANGUAGE_ADAPTERS.map((a) => a.id)).toContain("javascript");
  });

  it("chaque adaptateur de route a les champs requis", () => {
    for (const adapter of ROUTE_ADAPTERS) {
      expect(adapter.id).toBeTruthy();
      expect(adapter.name).toBeTruthy();
      expect(adapter.packages.length).toBeGreaterThan(0);
      expect(adapter.defaultFilePattern).toBeTruthy();
      expect(typeof adapter.extract).toBe("function");
    }
  });

  it("chaque adaptateur DB a les champs requis", () => {
    for (const adapter of DB_ADAPTERS) {
      expect(adapter.id).toBeTruthy();
      expect(adapter.name).toBeTruthy();
      // raw-sql est détecté par fichiers (packages: []) — les autres ont au moins 1 package
      if (adapter.id !== "raw-sql") {
        expect(adapter.packages.length).toBeGreaterThan(0);
      }
      expect(adapter.defaultFilePattern).toBeTruthy();
      expect(typeof adapter.extract).toBe("function");
    }
  });

  it("chaque adaptateur hooks a les champs requis", () => {
    for (const adapter of HOOKS_ADAPTERS) {
      expect(adapter.id).toBeTruthy();
      expect(adapter.name).toBeTruthy();
      expect(adapter.packages.length).toBeGreaterThan(0);
      expect(typeof adapter.classifyHook).toBe("function");
    }
  });

  it("chaque adaptateur langage a les champs requis", () => {
    for (const adapter of LANGUAGE_ADAPTERS) {
      expect(adapter.id).toBeTruthy();
      expect(adapter.name).toBeTruthy();
      expect(adapter.extensions.length).toBeGreaterThan(0);
      expect(adapter.exportFunctionPattern).toBeInstanceOf(RegExp);
      expect(adapter.exportConstArrowPattern).toBeInstanceOf(RegExp);
      expect(adapter.interfacePattern).toBeInstanceOf(RegExp);
      expect(adapter.typeAliasPattern).toBeInstanceOf(RegExp);
      expect(adapter.enumPattern).toBeInstanceOf(RegExp);
    }
  });
});

describe("findRouteAdapter", () => {
  it("trouve l'adaptateur elysia", () => {
    const adapter = findRouteAdapter("elysia");
    expect(adapter?.id).toBe("elysia");
  });

  it("trouve l'adaptateur express", () => {
    const adapter = findRouteAdapter("express");
    expect(adapter?.id).toBe("express");
  });

  it("trouve l'adaptateur koa", () => {
    expect(findRouteAdapter("koa")?.id).toBe("koa");
  });

  it("retourne undefined pour un id inconnu", () => {
    expect(findRouteAdapter("fastify")).toBeUndefined();
  });
});

describe("findDbAdapter", () => {
  it("trouve l'adaptateur drizzle", () => {
    const adapter = findDbAdapter("drizzle");
    expect(adapter?.id).toBe("drizzle");
  });

  it("trouve l'adaptateur knex", () => {
    expect(findDbAdapter("knex")?.id).toBe("knex");
  });

  it("retourne undefined pour un id inconnu", () => {
    expect(findDbAdapter("prisma")).toBeUndefined();
  });
});

describe("findHooksAdapter", () => {
  it("trouve l'adaptateur tanstack-query", () => {
    const adapter = findHooksAdapter("tanstack-query");
    expect(adapter?.id).toBe("tanstack-query");
  });

  it("retourne undefined pour un id inconnu", () => {
    expect(findHooksAdapter("swr")).toBeUndefined();
  });
});

describe("findLanguageAdapter", () => {
  it("trouve l'adaptateur typescript", () => {
    const adapter = findLanguageAdapter("typescript");
    expect(adapter?.id).toBe("typescript");
  });

  it("retourne undefined pour un id inconnu", () => {
    expect(findLanguageAdapter("kotlin")).toBeUndefined();
    expect(findLanguageAdapter("python")).toBeUndefined();
  });
});

describe("detectRouteFramework", () => {
  it("détecte elysia", () => {
    expect(detectRouteFramework({ elysia: "^1.0.0" })).toBe("elysia");
  });

  it("détecte express", () => {
    expect(detectRouteFramework({ express: "^4.0.0" })).toBe("express");
  });

  it("détecte koa via @koa/router", () => {
    expect(detectRouteFramework({ "@koa/router": "^12.0.0" })).toBe("koa");
  });

  it("retourne none par défaut si aucun adaptateur trouvé", () => {
    expect(detectRouteFramework({ fastify: "^4.0.0" })).toBe("none");
    expect(detectRouteFramework({})).toBe("none");
  });
});

describe("detectDbFramework", () => {
  it("détecte drizzle", () => {
    expect(detectDbFramework({ "drizzle-orm": "^0.30.0" })).toBe("drizzle");
  });

  it("détecte knex", () => {
    expect(detectDbFramework({ knex: "^3.0.0" })).toBe("knex");
  });

  it("retourne none par défaut", () => {
    expect(detectDbFramework({ "@prisma/client": "^5.0.0" })).toBe("none");
    expect(detectDbFramework({})).toBe("none");
  });
});

describe("detectHooksFramework", () => {
  it("détecte tanstack-query", () => {
    expect(detectHooksFramework({ "@tanstack/react-query": "^5.0.0" })).toBe("tanstack-query");
  });

  it("retourne none par défaut", () => {
    expect(detectHooksFramework({ swr: "^2.0.0" })).toBe("none");
    expect(detectHooksFramework({})).toBe("none");
  });
});
