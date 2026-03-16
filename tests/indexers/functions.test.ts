import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  extractJsDoc,
  extractSignature,
  extractExportedFunctions,
  extractServiceMethods,
  extractClassMethods,
  extractAllFunctions,
  runFunctionsIndexer,
} from "../../src/indexers/functions.indexer";
import { typescriptAdapter } from "../../src/adapters/language/typescript.adapter";
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

describe("extractClassMethods", () => {
  const file = "/fake/user.service.ts";

  it("extrait les méthodes avec indentation 4 espaces", () => {
    const content = `
class UserService {
    getUser(id: string) {
        return null;
    }
}`;
    const methods = extractClassMethods(content, file, false);
    expect(methods.some((m) => m.name === "getUser")).toBe(true);
    expect(methods[0].kind).toBe("class-method");
  });

  it("extrait les méthodes statiques", () => {
    const content = `
class MathUtils {
  static compute(a: number, b: number) {
    return a + b;
  }
  static async fetchAndCompute(url: string) {
    return 0;
  }
}`;
    const methods = extractClassMethods(content, file, false);
    expect(methods.some((m) => m.name === "compute")).toBe(true);
    expect(methods.some((m) => m.name === "fetchAndCompute")).toBe(true);
    const asyncMethod = methods.find((m) => m.name === "fetchAndCompute");
    expect(asyncMethod?.isAsync).toBe(true);
  });
});

describe("extractAllFunctions", () => {
  const file = "/fake/module.ts";

  it("extrait function foo() non-exporté", () => {
    const content = `function foo(x: number) { return x; }`;
    const fns = extractAllFunctions(content, file, false, typescriptAdapter);
    const fn = fns.find((f) => f.name === "foo");
    expect(fn).toBeDefined();
    expect(fn?.kind).toBe("named");
  });

  it("extrait const fn = () => non-exporté", () => {
    const content = `const greet = (name: string) => "hello " + name;`;
    const fns = extractAllFunctions(content, file, false, typescriptAdapter);
    const fn = fns.find((f) => f.name === "greet");
    expect(fn).toBeDefined();
    expect(fn?.kind).toBe("named");
  });

  it("extrait const fn = function() non-exporté", () => {
    const content = `const greet = function(name: string) { return "hello"; }`;
    const fns = extractAllFunctions(content, file, false, typescriptAdapter);
    const fn = fns.find((f) => f.name === "greet");
    expect(fn).toBeDefined();
    expect(fn?.kind).toBe("named");
  });

  it("extrait export default function name()", () => {
    const content = `export default function main(args: string[]) { }`;
    const fns = extractAllFunctions(content, file, false, typescriptAdapter);
    const fn = fns.find((f) => f.name === "main");
    expect(fn).toBeDefined();
    expect(fn?.kind).toBe("default-export");
  });

  it("extrait export default function() (anonyme)", () => {
    const content = `export default function(req: Request) { }`;
    const fns = extractAllFunctions(content, file, false, typescriptAdapter);
    const fn = fns.find((f) => f.name === "default");
    expect(fn).toBeDefined();
    expect(fn?.kind).toBe("default-export");
  });

  it("extrait Foo.prototype.bar = function()", () => {
    const content = `Foo.prototype.bar = function(x) { return x; }`;
    const fns = extractAllFunctions(content, file, false, typescriptAdapter);
    const fn = fns.find((f) => f.name === "Foo.prototype.bar");
    expect(fn).toBeDefined();
    expect(fn?.kind).toBe("prototype");
  });

  it("extrait module.exports.name = function()", () => {
    const content = `module.exports.parse = function(input) { return input; }`;
    const fns = extractAllFunctions(content, file, false, typescriptAdapter);
    const fn = fns.find((f) => f.name === "parse");
    expect(fn).toBeDefined();
    expect(fn?.kind).toBe("cjs-export");
  });

  it("extrait exports.name = function()", () => {
    const content = `exports.format = function(str) { return str; }`;
    const fns = extractAllFunctions(content, file, false, typescriptAdapter);
    const fn = fns.find((f) => f.name === "format");
    expect(fn).toBeDefined();
    expect(fn?.kind).toBe("cjs-export");
  });

  it("extrait function* gen() (générateur)", () => {
    const content = `function* range(start: number, end: number) { yield start; }`;
    const fns = extractAllFunctions(content, file, false, typescriptAdapter);
    const fn = fns.find((f) => f.name === "range");
    expect(fn).toBeDefined();
    expect(fn?.kind).toBe("generator");
  });

  it("extrait export function* gen() (générateur exporté)", () => {
    const content = `export function* items(list: any[]) { yield list[0]; }`;
    const fns = extractAllFunctions(content, file, false, typescriptAdapter);
    const fn = fns.find((f) => f.name === "items");
    expect(fn).toBeDefined();
    expect(fn?.kind).toBe("generator");
  });

  it("extrait les méthodes de classe dans un fichier non-service", () => {
    const content = `
class Parser {
  parse(input: string) {
    return input;
  }
}`;
    const fns = extractAllFunctions(content, file, false, typescriptAdapter);
    const fn = fns.find((f) => f.name === "parse");
    expect(fn).toBeDefined();
    expect(fn?.kind).toBe("class-method");
  });

  it("extrait static async compute()", () => {
    const content = `
class Utils {
  static async compute(data: number[]) {
    return 0;
  }
}`;
    const fns = extractAllFunctions(content, file, false, typescriptAdapter);
    const fn = fns.find((f) => f.name === "compute");
    expect(fn).toBeDefined();
    expect(fn?.kind).toBe("class-method");
    expect(fn?.isAsync).toBe(true);
  });

  it("ne duplique pas une export function", () => {
    const content = `export function greet(name: string) { return "hi"; }`;
    const fns = extractAllFunctions(content, file, false, typescriptAdapter);
    const matches = fns.filter((f) => f.name === "greet");
    expect(matches).toHaveLength(1);
    expect(matches[0].kind).toBe("exported");
  });

  it("ne duplique pas un export const arrow", () => {
    const content = `export const add = (a: number, b: number) => a + b;`;
    const fns = extractAllFunctions(content, file, false, typescriptAdapter);
    const matches = fns.filter((f) => f.name === "add");
    expect(matches).toHaveLength(1);
    expect(matches[0].kind).toBe("exported");
  });

  it("attribue le bon kind à chaque type", () => {
    const content = `export function exp(x: number) { return x; }
function named(y: number) { return y; }
const arrow = (z: number) => z;`;
    const fns = extractAllFunctions(content, file, false, typescriptAdapter);
    expect(fns.find((f) => f.name === "exp")?.kind).toBe("exported");
    expect(fns.find((f) => f.name === "named")?.kind).toBe("named");
    expect(fns.find((f) => f.name === "arrow")?.kind).toBe("named");
  });
});

describe("runFunctionsIndexer", () => {
  it("génère le header avec le nom du projet", () => {
    const config = { ...DEFAULT_CONFIG, name: "my-app", include: [], exclude: [] };
    const output = runFunctionsIndexer(tmpDir, config);
    expect(output).toContain("# FUNCTIONS — my-app");
  });

  it("liste les fonctions exportées et non-exportées", () => {
    mkdirSync(join(tmpDir, "src"));
    writeFileSync(
      join(tmpDir, "src", "utils.ts"),
      `export function greet(name: string) { return "hello " + name; }
export async function fetchData() { return []; }
function helper(x: number) { return x * 2; }
const transform = (s: string) => s.toUpperCase();`,
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
    expect(output).toContain("helper");
    expect(output).toContain("transform");
    expect(output).toContain("`named`");
    expect(output).not.toContain("fonctions exportées");
    expect(output).toContain("fonctions");
  });
});
