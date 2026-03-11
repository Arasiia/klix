import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  extractJsDoc,
  extractSignature,
  extractExportedFunctions,
  extractServiceMethods,
  runFunctionsIndexer,
} from "../../src/indexers/functions.indexer";
import { DEFAULT_CONFIG } from "../../src/lib/config";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "klix-functions-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("extractJsDoc", () => {
  it("extrait la description d'un JSDoc", () => {
    const content = `/**\n * Récupère un utilisateur par ID\n */\nexport function getUser() {}`;
    const funcStart = content.indexOf("export function");
    const jsDoc = extractJsDoc(content, funcStart);
    expect(jsDoc).toContain("Récupère un utilisateur par ID");
  });

  it("extrait les @param", () => {
    const content = `/**\n * Description\n * @param id L'identifiant\n */\nexport function getUser() {}`;
    const funcStart = content.indexOf("export function");
    const jsDoc = extractJsDoc(content, funcStart);
    expect(jsDoc).toContain("@param");
    expect(jsDoc).toContain("L'identifiant");
  });

  it("extrait les @returns", () => {
    const content = `/**\n * Description\n * @returns L'utilisateur trouvé\n */\nexport function getUser() {}`;
    const funcStart = content.indexOf("export function");
    const jsDoc = extractJsDoc(content, funcStart);
    expect(jsDoc).toContain("@returns");
  });

  it("retourne undefined s'il n'y a pas de JSDoc", () => {
    const content = `export function getUser() {}`;
    const jsDoc = extractJsDoc(content, 0);
    expect(jsDoc).toBeUndefined();
  });

  it("retourne undefined si le JSDoc n'est pas juste avant la fonction", () => {
    const content = `/**\n * JSDoc\n */\n\nconst x = 1;\nexport function getUser() {}`;
    const funcStart = content.indexOf("export function");
    const jsDoc = extractJsDoc(content, funcStart);
    expect(jsDoc).toBeUndefined();
  });

  it("ignore les tags @ inconnus", () => {
    const content = `/**\n * Description\n * @deprecated Ancienne API\n */\nexport function old() {}`;
    const funcStart = content.indexOf("export function");
    const jsDoc = extractJsDoc(content, funcStart);
    expect(jsDoc).toContain("Description");
    expect(jsDoc).not.toContain("@deprecated");
  });
});

describe("extractSignature", () => {
  it("extrait les paramètres simples", () => {
    const content = `export function foo(a: string, b: number) {}`;
    const idx = content.indexOf("export function");
    const sig = extractSignature(content, idx);
    expect(sig).toBe("(a, b)");
  });

  it("extrait sans paramètres", () => {
    const content = `export function foo() {}`;
    const idx = content.indexOf("export function");
    const sig = extractSignature(content, idx);
    expect(sig).toBe("()");
  });

  it("extrait les paramètres avec types complexes", () => {
    const content = `export function foo(config: { name: string; value: number }) {}`;
    const idx = content.indexOf("export function");
    const sig = extractSignature(content, idx);
    expect(sig).toMatch(/\(config.*\)/);
  });
});

describe("extractExportedFunctions", () => {
  const file = "/fake/module.ts";

  it("extrait les export function", () => {
    const content = `export function getUser(id: string) { return null; }`;
    const fns = extractExportedFunctions(content, file, false);
    expect(fns.some((f) => f.name === "getUser")).toBe(true);
  });

  it("extrait les export async function", () => {
    const content = `export async function fetchData() { return []; }`;
    const fns = extractExportedFunctions(content, file, false);
    const fn = fns.find((f) => f.name === "fetchData");
    expect(fn?.isAsync).toBe(true);
  });

  it("extrait les export const = () =>", () => {
    const content = `export const getUser = (id: string) => user;`;
    const fns = extractExportedFunctions(content, file, false);
    expect(fns.some((f) => f.name === "getUser")).toBe(true);
  });

  it("extrait les export const async = async () =>", () => {
    const content = `export const fetchUser = async (id: string) => user;`;
    const fns = extractExportedFunctions(content, file, false);
    const fn = fns.find((f) => f.name === "fetchUser");
    expect(fn?.isAsync).toBe(true);
  });

  it("inclut le JSDoc si activé", () => {
    const content = `/**\n * Récupère un user\n */\nexport function getUser() {}`;
    const fns = extractExportedFunctions(content, file, true);
    const fn = fns.find((f) => f.name === "getUser");
    expect(fn?.jsDoc).toContain("Récupère un user");
  });

  it("n'inclut pas le JSDoc si désactivé", () => {
    const content = `/**\n * Récupère un user\n */\nexport function getUser() {}`;
    const fns = extractExportedFunctions(content, file, false);
    const fn = fns.find((f) => f.name === "getUser");
    expect(fn?.jsDoc).toBeUndefined();
  });

  it("retourne tableau vide si pas de fonctions exportées", () => {
    const content = `const privateVar = 42;`;
    const fns = extractExportedFunctions(content, file, false);
    expect(fns).toHaveLength(0);
  });
});

describe("extractServiceMethods", () => {
  const file = "/fake/user.service.ts";

  it("extrait les méthodes de classe avec indentation 2 espaces", () => {
    const content = `
class UserService {
  getUser(id: string) {
    return null;
  }
}`;
    const methods = extractServiceMethods(content, file, false);
    expect(methods.some((m) => m.name === "getUser")).toBe(true);
  });

  it("détecte les méthodes async", () => {
    const content = `
class UserService {
  async fetchUser(id: string) {
    return null;
  }
}`;
    const methods = extractServiceMethods(content, file, false);
    const m = methods.find((m) => m.name === "fetchUser");
    expect(m?.isAsync).toBe(true);
  });

  it("ignore le constructeur", () => {
    const content = `
class UserService {
  constructor(private db: DB) {}
  getUser(id: string) {}
}`;
    const methods = extractServiceMethods(content, file, false);
    expect(methods.some((m) => m.name === "constructor")).toBe(false);
    expect(methods.some((m) => m.name === "getUser")).toBe(true);
  });

  it("ignore les mots clés de contrôle", () => {
    const content = `
class Srv {
  doWork() {
    if (true) {}
  }
}`;
    const methods = extractServiceMethods(content, file, false);
    expect(methods.some((m) => m.name === "if")).toBe(false);
  });
});

describe("runFunctionsIndexer", () => {
  it("génère le header avec le nom du projet", () => {
    const config = { ...DEFAULT_CONFIG, name: "my-app", include: [], exclude: [] };
    const output = runFunctionsIndexer(tmpDir, config);
    expect(output).toContain("# FUNCTIONS — my-app");
  });

  it("liste les fonctions exportées", () => {
    mkdirSync(join(tmpDir, "src"));
    writeFileSync(
      join(tmpDir, "src", "utils.ts"),
      `export function greet(name: string) { return "hello " + name; }\nexport async function fetchData() { return []; }`,
    );
    const config = {
      ...DEFAULT_CONFIG,
      include: ["src/**/*.ts"],
      exclude: [],
      indexers: {
        ...DEFAULT_CONFIG.indexers,
        functions: {
          enabled: true,
          includeJsDoc: false,
          servicePattern: "**/*.service.ts",
          excludeTsx: true,
        },
      },
    };
    const output = runFunctionsIndexer(tmpDir, config);
    expect(output).toContain("greet");
    expect(output).toContain("fetchData");
    expect(output).toContain("async ");
  });
});
