import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { matchesAnyPattern, walkFiles, globFiles } from "../../src/lib/walker";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "klix-walker-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("matchesAnyPattern", () => {
  it("correspond à un pattern simple", () => {
    expect(matchesAnyPattern("src/index.ts", ["src/index.ts"])).toBe(true);
  });

  it("correspond avec un wildcard *", () => {
    expect(matchesAnyPattern("src/foo.ts", ["src/*.ts"])).toBe(true);
  });

  it("ne correspond pas à un sous-dossier avec *", () => {
    expect(matchesAnyPattern("src/sub/foo.ts", ["src/*.ts"])).toBe(false);
  });

  it("correspond avec ** récursif", () => {
    expect(matchesAnyPattern("src/a/b/foo.ts", ["src/**/*.ts"])).toBe(true);
  });

  it("correspond avec ** sans sous-dossier", () => {
    expect(matchesAnyPattern("src/foo.ts", ["src/**/*.ts"])).toBe(true);
  });

  it("correspond avec plusieurs patterns", () => {
    expect(matchesAnyPattern("src/foo.tsx", ["src/**/*.ts", "src/**/*.tsx"])).toBe(true);
  });

  it("retourne false si aucun pattern ne correspond", () => {
    expect(matchesAnyPattern("src/foo.js", ["src/**/*.ts"])).toBe(false);
  });

  it("gère les patterns node_modules", () => {
    expect(matchesAnyPattern("node_modules/lodash/index.js", ["**/node_modules/**"])).toBe(true);
  });

  it("correspond avec ? pour un seul caractère", () => {
    expect(matchesAnyPattern("src/a.ts", ["src/?.ts"])).toBe(true);
    expect(matchesAnyPattern("src/ab.ts", ["src/?.ts"])).toBe(false);
  });

  it("normalise les backslashes Windows", () => {
    expect(matchesAnyPattern("src\\foo.ts", ["src/**/*.ts"])).toBe(true);
  });
});

describe("walkFiles", () => {
  it("trouve les fichiers correspondant aux includes", () => {
    writeFileSync(join(tmpDir, "foo.ts"), "");
    writeFileSync(join(tmpDir, "bar.js"), "");
    const files = walkFiles(tmpDir, ["**/*.ts"], []);
    expect(files.some((f) => f.endsWith("foo.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("bar.js"))).toBe(false);
  });

  it("exclut les fichiers correspondant aux excludes", () => {
    mkdirSync(join(tmpDir, "node_modules"));
    writeFileSync(join(tmpDir, "node_modules", "lib.ts"), "");
    writeFileSync(join(tmpDir, "app.ts"), "");

    const files = walkFiles(tmpDir, ["**/*.ts"], ["**/node_modules/**"]);
    expect(files.some((f) => f.includes("node_modules"))).toBe(false);
    expect(files.some((f) => f.endsWith("app.ts"))).toBe(true);
  });

  it("parcourt récursivement les sous-dossiers", () => {
    mkdirSync(join(tmpDir, "src", "sub"), { recursive: true });
    writeFileSync(join(tmpDir, "src", "sub", "deep.ts"), "");
    const files = walkFiles(tmpDir, ["**/*.ts"], []);
    expect(files.some((f) => f.endsWith("deep.ts"))).toBe(true);
  });

  it("retourne un tableau vide si aucun fichier correspond", () => {
    writeFileSync(join(tmpDir, "readme.md"), "");
    const files = walkFiles(tmpDir, ["**/*.ts"], []);
    expect(files).toHaveLength(0);
  });

  it("retourne les fichiers triés", () => {
    writeFileSync(join(tmpDir, "z.ts"), "");
    writeFileSync(join(tmpDir, "a.ts"), "");
    const files = walkFiles(tmpDir, ["**/*.ts"], []);
    expect(files[0].endsWith("a.ts")).toBe(true);
    expect(files[1].endsWith("z.ts")).toBe(true);
  });

  it("ne plante pas si le dossier n'existe pas", () => {
    const files = walkFiles("/nonexistent/path", ["**/*.ts"], []);
    expect(files).toHaveLength(0);
  });
});

describe("globFiles", () => {
  it("équivaut à walkFiles avec un seul pattern", () => {
    writeFileSync(join(tmpDir, "test.ts"), "");
    const files = globFiles(tmpDir, "**/*.ts");
    expect(files.some((f) => f.endsWith("test.ts"))).toBe(true);
  });

  it("accepte un tableau d'exclusions", () => {
    mkdirSync(join(tmpDir, "dist"));
    writeFileSync(join(tmpDir, "dist", "out.ts"), "");
    writeFileSync(join(tmpDir, "src.ts"), "");
    const files = globFiles(tmpDir, "**/*.ts", ["**/dist/**"]);
    expect(files.some((f) => f.includes("dist"))).toBe(false);
    expect(files.some((f) => f.endsWith("src.ts"))).toBe(true);
  });
});
