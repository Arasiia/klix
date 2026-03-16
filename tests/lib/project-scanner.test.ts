import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  detectLanguage,
  detectSourceRoots,
  buildIncludePatterns,
  buildExcludePatterns,
  detectRouteFiles,
  enrichApiPrefix,
  detectServiceFiles,
  detectTypeFiles,
  detectDbSchemaFiles,
  detectHookFiles,
  scanProject,
  shallowFileList,
  dirHasSourceFiles,
} from "../../src/lib/project-scanner";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "klix-scanner-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ */
/*  Helpers pour créer des arborescences de test                       */
/* ------------------------------------------------------------------ */

function touch(path: string, content = "") {
  const dir = path.substring(0, path.lastIndexOf("/"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, content);
}

function writePkg(deps: Record<string, string> = {}, devDeps: Record<string, string> = {}) {
  writeFileSync(
    join(tmpDir, "package.json"),
    JSON.stringify({ dependencies: deps, devDependencies: devDeps }),
  );
}

/* ------------------------------------------------------------------ */
/*  shallowFileList                                                    */
/* ------------------------------------------------------------------ */

describe("shallowFileList", () => {
  it("liste les fichiers jusqu'à maxDepth", () => {
    touch(join(tmpDir, "a.ts"), "");
    touch(join(tmpDir, "sub/b.ts"), "");
    touch(join(tmpDir, "sub/deep/c.ts"), "");
    touch(join(tmpDir, "sub/deep/deeper/d.ts"), "");

    const files = shallowFileList(tmpDir, 2);
    expect(files).toContain("a.ts");
    expect(files).toContain("sub/b.ts");
    expect(files).toContain("sub/deep/c.ts");
    // depth 3 → not included
    expect(files).not.toContain("sub/deep/deeper/d.ts");
  });

  it("ignore node_modules et .git", () => {
    touch(join(tmpDir, "node_modules/pkg/index.js"), "");
    touch(join(tmpDir, ".git/config"), "");
    touch(join(tmpDir, "src/index.ts"), "");

    const files = shallowFileList(tmpDir, 2);
    expect(files).toContain("src/index.ts");
    expect(files.some((f) => f.includes("node_modules"))).toBe(false);
    expect(files.some((f) => f.includes(".git"))).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  dirHasSourceFiles                                                  */
/* ------------------------------------------------------------------ */

describe("dirHasSourceFiles", () => {
  it("retourne true si le dossier contient un fichier source", () => {
    touch(join(tmpDir, "src/index.ts"), "");
    expect(dirHasSourceFiles(join(tmpDir, "src"))).toBe(true);
  });

  it("retourne true pour un fichier source un niveau plus bas", () => {
    touch(join(tmpDir, "src/routes/index.ts"), "");
    expect(dirHasSourceFiles(join(tmpDir, "src"))).toBe(true);
  });

  it("retourne false pour un dossier vide", () => {
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    expect(dirHasSourceFiles(join(tmpDir, "src"))).toBe(false);
  });

  it("retourne false pour un dossier inexistant", () => {
    expect(dirHasSourceFiles(join(tmpDir, "nope"))).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  detectLanguage                                                     */
/* ------------------------------------------------------------------ */

describe("detectLanguage", () => {
  it("projet TS (tsconfig + fichiers .ts)", () => {
    touch(join(tmpDir, "tsconfig.json"), "{}");
    touch(join(tmpDir, "src/index.ts"), "");
    touch(join(tmpDir, "src/app.ts"), "");

    const result = detectLanguage(tmpDir);
    expect(result.language).toBe("typescript");
    expect(result.hasTsConfig).toBe(true);
    expect(result.isMixed).toBe(false);
  });

  it("projet JS (pas de tsconfig, fichiers .js)", () => {
    touch(join(tmpDir, "app/index.js"), "");
    touch(join(tmpDir, "app/routes.js"), "");

    const result = detectLanguage(tmpDir);
    expect(result.language).toBe("javascript");
    expect(result.hasTsConfig).toBe(false);
  });

  it("projet mixte (tsconfig + majorité .js)", () => {
    touch(join(tmpDir, "tsconfig.json"), "{}");
    touch(join(tmpDir, "src/config.ts"), "");
    touch(join(tmpDir, "app/index.js"), "");
    touch(join(tmpDir, "app/routes.js"), "");
    touch(join(tmpDir, "app/services.js"), "");

    const result = detectLanguage(tmpDir);
    expect(result.language).toBe("typescript");
    expect(result.hasTsConfig).toBe(true);
    expect(result.isMixed).toBe(true);
  });

  it("projet vide → fallback typescript", () => {
    const result = detectLanguage(tmpDir);
    expect(result.language).toBe("typescript");
  });
});

/* ------------------------------------------------------------------ */
/*  detectSourceRoots                                                  */
/* ------------------------------------------------------------------ */

describe("detectSourceRoots", () => {
  it("src/ avec fichiers → ['src']", () => {
    touch(join(tmpDir, "src/index.ts"), "");
    expect(detectSourceRoots(tmpDir)).toEqual(["src"]);
  });

  it("app/ avec fichiers → ['app']", () => {
    touch(join(tmpDir, "app/index.js"), "");
    expect(detectSourceRoots(tmpDir)).toEqual(["app"]);
  });

  it("src/ + lib/ → ['src', 'lib']", () => {
    touch(join(tmpDir, "src/index.ts"), "");
    touch(join(tmpDir, "lib/utils.ts"), "");
    expect(detectSourceRoots(tmpDir)).toEqual(["src", "lib"]);
  });

  it("aucun dossier reconnu → ['.']", () => {
    touch(join(tmpDir, "index.ts"), "");
    expect(detectSourceRoots(tmpDir)).toEqual(["."]);
  });

  it("dossier src/ vide (sans fichiers source) → ignoré", () => {
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(join(tmpDir, "src/readme.md"), "# Hello");
    expect(detectSourceRoots(tmpDir)).toEqual(["."]);
  });

  it("primary + secondary roots → les deux inclus", () => {
    touch(join(tmpDir, "src/index.ts"), "");
    touch(join(tmpDir, "utils/helpers.ts"), "");
    touch(join(tmpDir, "middleware/auth.ts"), "");
    const roots = detectSourceRoots(tmpDir);
    expect(roots).toContain("src");
    expect(roots).toContain("utils");
    expect(roots).toContain("middleware");
  });

  it("secondary seuls (pas de primary) → secondary comme roots", () => {
    touch(join(tmpDir, "utils/helpers.ts"), "");
    touch(join(tmpDir, "pages/index.ts"), "");
    const roots = detectSourceRoots(tmpDir);
    expect(roots).toContain("utils");
    expect(roots).toContain("pages");
    expect(roots).not.toContain(".");
  });
});

/* ------------------------------------------------------------------ */
/*  buildIncludePatterns                                               */
/* ------------------------------------------------------------------ */

describe("buildIncludePatterns", () => {
  it("root ['src'] + TS → src/**/*.ts, src/**/*.tsx", () => {
    const patterns = buildIncludePatterns(["src"], "typescript", true, false);
    expect(patterns).toEqual(["src/**/*.ts", "src/**/*.tsx"]);
  });

  it("root ['app'] + JS → app/**/*.js, app/**/*.jsx", () => {
    const patterns = buildIncludePatterns(["app"], "javascript", false, false);
    expect(patterns).toEqual(["app/**/*.js", "app/**/*.jsx"]);
  });

  it("root ['app'] + mixte → toutes extensions", () => {
    const patterns = buildIncludePatterns(["app"], "typescript", true, true);
    expect(patterns).toEqual(["app/**/*.ts", "app/**/*.tsx", "app/**/*.js", "app/**/*.jsx"]);
  });

  it("root ['.'] → pas de préfixe", () => {
    const patterns = buildIncludePatterns(["."], "typescript", true, false);
    expect(patterns).toEqual(["**/*.ts", "**/*.tsx"]);
  });

  it("roots multiples", () => {
    const patterns = buildIncludePatterns(["src", "lib"], "typescript", true, false);
    expect(patterns).toEqual(["src/**/*.ts", "src/**/*.tsx", "lib/**/*.ts", "lib/**/*.tsx"]);
  });
});

/* ------------------------------------------------------------------ */
/*  buildExcludePatterns                                               */
/* ------------------------------------------------------------------ */

describe("buildExcludePatterns", () => {
  it("sans deps spécifiques → liste de base", () => {
    const patterns = buildExcludePatterns(tmpDir, {});
    expect(patterns).toContain("**/node_modules/**");
    expect(patterns).toContain("**/*.d.ts");
    expect(patterns).not.toContain("**/drizzle/**");
    expect(patterns).not.toContain("**/migrations/**");
  });

  it("avec drizzle-orm → inclut **/drizzle/**", () => {
    const patterns = buildExcludePatterns(tmpDir, { "drizzle-orm": "^0.30.0" });
    expect(patterns).toContain("**/drizzle/**");
  });

  it("avec dossier migrations → inclut **/migrations/**", () => {
    mkdirSync(join(tmpDir, "migrations"), { recursive: true });
    const patterns = buildExcludePatterns(tmpDir, {});
    expect(patterns).toContain("**/migrations/**");
  });

  it("inclut les nouveaux patterns framework", () => {
    const patterns = buildExcludePatterns(tmpDir, {});
    expect(patterns).toContain("**/.next/**");
    expect(patterns).toContain("**/.nuxt/**");
    expect(patterns).toContain("**/.vercel/**");
    expect(patterns).toContain("**/.turbo/**");
    expect(patterns).toContain("**/.svelte-kit/**");
    expect(patterns).toContain("**/.astro/**");
    expect(patterns).toContain("**/public/**");
    expect(patterns).toContain("**/static/**");
    expect(patterns).toContain("**/seeds/**");
    expect(patterns).toContain("**/seed/**");
    expect(patterns).toContain("**/fixtures/**");
    expect(patterns).toContain("**/prisma/migrations/**");
    expect(patterns).toContain("*.config.{ts,js,mjs,cjs}");
  });

  it("exclut les seeds détectés depuis knexfile", () => {
    writeFileSync(
      join(tmpDir, "knexfile.ts"),
      `module.exports = { seeds: { directory: './db/seeds' } };`,
    );
    mkdirSync(join(tmpDir, "db/seeds"), { recursive: true });
    const patterns = buildExcludePatterns(tmpDir, {});
    expect(patterns).toContain("**/db/seeds/**");
  });
});

/* ------------------------------------------------------------------ */
/*  detectRouteFiles                                                   */
/* ------------------------------------------------------------------ */

describe("detectRouteFiles", () => {
  it("dossier app/routes/ avec sous-dossiers → app/routes/**/*.{ts,tsx}", () => {
    touch(join(tmpDir, "app/routes/dashboards/v1/dashboards.ts"), "");
    const result = detectRouteFiles(tmpDir, ["app"], "{ts,tsx}");
    expect(result.detected).toBe(true);
    expect(result.filePattern).toBe("app/routes/**/*.{ts,tsx}");
  });

  it("fichier app/routes.js au root → app/routes*.{js,jsx}", () => {
    touch(join(tmpDir, "app/routes.js"), "");
    touch(join(tmpDir, "app/routes-v2.js"), "");
    // No routes/ directory, just files
    const result = detectRouteFiles(tmpDir, ["app"], "{js,jsx}");
    expect(result.detected).toBe(true);
    expect(result.filePattern).toBe("app/routes*.{js,jsx}");
  });

  it("dossier src/controllers/ → src/controllers/**/*.{ts,tsx}", () => {
    touch(join(tmpDir, "src/controllers/user.ts"), "");
    const result = detectRouteFiles(tmpDir, ["src"], "{ts,tsx}");
    expect(result.detected).toBe(true);
    expect(result.filePattern).toBe("src/controllers/**/*.{ts,tsx}");
  });

  it("dossier src/routes/ flat → src/routes/**/*.{ts,tsx}", () => {
    touch(join(tmpDir, "src/routes/index.ts"), "");
    touch(join(tmpDir, "src/routes/users.ts"), "");
    const result = detectRouteFiles(tmpDir, ["src"], "{ts,tsx}");
    expect(result.detected).toBe(true);
    expect(result.filePattern).toBe("src/routes/**/*.{ts,tsx}");
  });

  it("rien trouvé → detected: false", () => {
    touch(join(tmpDir, "src/index.ts"), "");
    const result = detectRouteFiles(tmpDir, ["src"], "{ts,tsx}");
    expect(result.detected).toBe(false);
    expect(result.filePattern).toBeUndefined();
  });

  it("routes/api/ existe → apiPrefix /api", () => {
    touch(join(tmpDir, "src/routes/api/users.ts"), "");
    const result = detectRouteFiles(tmpDir, ["src"], "{ts,tsx}");
    expect(result.apiPrefix).toBe("/api");
  });

  it("routes/ sans api/ → apiPrefix /", () => {
    touch(join(tmpDir, "src/routes/users.ts"), "");
    const result = detectRouteFiles(tmpDir, ["src"], "{ts,tsx}");
    expect(result.apiPrefix).toBe("/");
  });

  it("dossier src/api/ → src/api/**/*.{ts,tsx}", () => {
    touch(join(tmpDir, "src/api/users.ts"), "");
    const result = detectRouteFiles(tmpDir, ["src"], "{ts,tsx}");
    expect(result.detected).toBe(true);
    expect(result.filePattern).toBe("src/api/**/*.{ts,tsx}");
  });

  it("dossier src/endpoints/ → src/endpoints/**/*.{ts,tsx}", () => {
    touch(join(tmpDir, "src/endpoints/users.ts"), "");
    const result = detectRouteFiles(tmpDir, ["src"], "{ts,tsx}");
    expect(result.detected).toBe(true);
    expect(result.filePattern).toBe("src/endpoints/**/*.{ts,tsx}");
  });

  it("enrichApiPrefix détecte depuis app.use()", () => {
    touch(join(tmpDir, "src/index.ts"), `const app = express();\napp.use('/api/v2', router);`);
    const routes = { detected: true, filePattern: "src/routes/**/*.{ts,tsx}", apiPrefix: "/" };
    const enriched = enrichApiPrefix(tmpDir, ["src"], routes);
    expect(enriched.apiPrefix).toBe("/api/v2");
  });

  it("enrichApiPrefix garde le prefix existant si pas '/'", () => {
    touch(join(tmpDir, "src/index.ts"), `app.use('/api/v2', router);`);
    const routes = { detected: true, filePattern: "src/routes/**/*.{ts,tsx}", apiPrefix: "/api" };
    const enriched = enrichApiPrefix(tmpDir, ["src"], routes);
    expect(enriched.apiPrefix).toBe("/api");
  });
});

/* ------------------------------------------------------------------ */
/*  detectServiceFiles                                                 */
/* ------------------------------------------------------------------ */

describe("detectServiceFiles", () => {
  it("dossier app/services/ → app/services/**/*.{js,jsx}", () => {
    touch(join(tmpDir, "app/services/auth.js"), "");
    const result = detectServiceFiles(tmpDir, ["app"], "{js,jsx}");
    expect(result).toBe("app/services/**/*.{js,jsx}");
  });

  it("fichiers *.service.ts dans src → **/*.service.{ts,tsx}", () => {
    touch(join(tmpDir, "src/auth.service.ts"), "");
    const result = detectServiceFiles(tmpDir, ["src"], "{ts,tsx}");
    // src/services/ doesn't exist, but .service. files found
    expect(result).toBe("**/*.service.{ts,tsx}");
  });

  it("rien → undefined", () => {
    touch(join(tmpDir, "src/index.ts"), "");
    const result = detectServiceFiles(tmpDir, ["src"], "{ts,tsx}");
    expect(result).toBeUndefined();
  });

  it("middleware/ + utils/ → tableau de patterns", () => {
    touch(join(tmpDir, "src/middleware/auth.ts"), "");
    touch(join(tmpDir, "src/utils/format.ts"), "");
    const result = detectServiceFiles(tmpDir, ["src"], "{ts,tsx}");
    expect(Array.isArray(result)).toBe(true);
    expect(result).toContain("src/middleware/**/*.{ts,tsx}");
    expect(result).toContain("src/utils/**/*.{ts,tsx}");
  });

  it("helpers/ → inclus dans le pattern", () => {
    touch(join(tmpDir, "src/helpers/date.ts"), "");
    const result = detectServiceFiles(tmpDir, ["src"], "{ts,tsx}");
    expect(result).toBe("src/helpers/**/*.{ts,tsx}");
  });

  it("NestJS → inclut *.service et *.controller", () => {
    touch(join(tmpDir, "src/index.ts"), "");
    const deps = { "@nestjs/core": "^10.0.0" };
    const result = detectServiceFiles(tmpDir, ["src"], "{ts,tsx}", deps);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toContain("**/*.service.{ts,tsx}");
    expect(result).toContain("**/*.controller.{ts,tsx}");
  });
});

/* ------------------------------------------------------------------ */
/*  detectTypeFiles                                                    */
/* ------------------------------------------------------------------ */

describe("detectTypeFiles", () => {
  it("dossier types/ → inclut le pattern", () => {
    touch(join(tmpDir, "src/types/user.ts"), "");
    const result = detectTypeFiles(tmpDir, ["src"], "{ts,tsx}");
    expect(result).toContain("src/types/**/*.{ts,tsx}");
  });

  it("fichiers *.types.ts → inclut **/*.types.{ext}", () => {
    touch(join(tmpDir, "src/user.types.ts"), "");
    const result = detectTypeFiles(tmpDir, ["src"], "{ts,tsx}");
    expect(result).toContain("**/*.types.{ts,tsx}");
  });

  it("rien → undefined", () => {
    touch(join(tmpDir, "src/index.ts"), "");
    const result = detectTypeFiles(tmpDir, ["src"], "{ts,tsx}");
    expect(result).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  detectDbSchemaFiles                                                */
/* ------------------------------------------------------------------ */

describe("detectDbSchemaFiles", () => {
  it("knex + dossier migrations/ → migrations/**/*.{js,jsx}", () => {
    mkdirSync(join(tmpDir, "migrations"), { recursive: true });
    touch(join(tmpDir, "migrations/001_init.js"), "");
    const result = detectDbSchemaFiles(tmpDir, ["app"], "knex", "{js,jsx}");
    expect(result.detected).toBe(true);
    expect(result.filePattern).toBe("migrations/**/*.{js,jsx}");
  });

  it("drizzle + dossier src/db/schema/ → src/db/schema/*.{ts,tsx}", () => {
    touch(join(tmpDir, "src/db/schema/users.ts"), "");
    const result = detectDbSchemaFiles(tmpDir, ["src"], "drizzle", "{ts,tsx}");
    expect(result.detected).toBe(true);
    expect(result.filePattern).toBe("src/db/schema/*.{ts,tsx}");
  });

  it("prisma → prisma/schema.prisma", () => {
    touch(join(tmpDir, "prisma/schema.prisma"), "");
    const result = detectDbSchemaFiles(tmpDir, ["src"], "prisma", "{ts,tsx}");
    expect(result.detected).toBe(true);
    expect(result.filePattern).toBe("prisma/schema.prisma");
  });

  it("pas de dossier → detected: false", () => {
    const result = detectDbSchemaFiles(tmpDir, ["src"], "knex", "{ts,tsx}");
    expect(result.detected).toBe(false);
  });

  it("framework none → detected: false", () => {
    const result = detectDbSchemaFiles(tmpDir, ["src"], "none", "{ts,tsx}");
    expect(result.detected).toBe(false);
  });

  it("knex avec knexfile.ts → détecte le bon chemin", () => {
    writeFileSync(
      join(tmpDir, "knexfile.ts"),
      `module.exports = { migrations: { directory: './db/migrations' } };`,
    );
    mkdirSync(join(tmpDir, "db/migrations"), { recursive: true });
    const result = detectDbSchemaFiles(tmpDir, ["src"], "knex", "{ts,tsx}");
    expect(result.detected).toBe(true);
    expect(result.filePattern).toBe("db/migrations/**/*.{ts,tsx}");
  });

  it("knex fallback dirs (db/migrations)", () => {
    mkdirSync(join(tmpDir, "db/migrations"), { recursive: true });
    const result = detectDbSchemaFiles(tmpDir, ["src"], "knex", "{ts,tsx}");
    expect(result.detected).toBe(true);
    expect(result.filePattern).toBe("db/migrations/**/*.{ts,tsx}");
  });

  it("knex fallback dirs (database/migrations)", () => {
    mkdirSync(join(tmpDir, "database/migrations"), { recursive: true });
    const result = detectDbSchemaFiles(tmpDir, ["src"], "knex", "{ts,tsx}");
    expect(result.detected).toBe(true);
    expect(result.filePattern).toBe("database/migrations/**/*.{ts,tsx}");
  });

  it("drizzle avec drizzle.config.ts → détecte le schema path (répertoire → glob récursif)", () => {
    writeFileSync(
      join(tmpDir, "drizzle.config.ts"),
      `export default defineConfig({ schema: './src/db/schema' });`,
    );
    mkdirSync(join(tmpDir, "src/db/schema"), { recursive: true });
    const result = detectDbSchemaFiles(tmpDir, ["src"], "drizzle", "{ts,tsx}");
    expect(result.detected).toBe(true);
    // Les répertoires utilisent /**/*.ext pour trouver les fichiers imbriqués
    expect(result.filePattern).toBe("src/db/schema/**/*.{ts,tsx}");
  });

  it("drizzle avec drizzle.config.ts (fichier unique)", () => {
    writeFileSync(
      join(tmpDir, "drizzle.config.ts"),
      `export default defineConfig({ schema: './src/schema.ts' });`,
    );
    touch(join(tmpDir, "src/schema.ts"), "");
    const result = detectDbSchemaFiles(tmpDir, ["src"], "drizzle", "{ts,tsx}");
    expect(result.detected).toBe(true);
    expect(result.filePattern).toBe("src/schema.ts");
  });

  it("drizzle avec drizzle.config.ts pointant vers index.ts (barrel) → répertoire parent /**/*.ext", () => {
    writeFileSync(
      join(tmpDir, "drizzle.config.ts"),
      `export default defineConfig({ schema: './src/db/schema/index.ts' });`,
    );
    touch(join(tmpDir, "src/db/schema/index.ts"), `export * from './users';\nexport * from './posts';`);
    touch(join(tmpDir, "src/db/schema/users.ts"), "");
    const result = detectDbSchemaFiles(tmpDir, ["src"], "drizzle", "{ts,tsx}");
    expect(result.detected).toBe(true);
    expect(result.filePattern).toBe("src/db/schema/**/*.{ts,tsx}");
    expect(result.filePattern).not.toBe("src/db/schema/index.ts");
  });

  it("drizzle avec drizzle.config.ts pointant vers index.js (barrel JS) → répertoire parent /**/*.ext", () => {
    writeFileSync(
      join(tmpDir, "drizzle.config.ts"),
      `export default defineConfig({ schema: './src/db/schema/index.js' });`,
    );
    touch(join(tmpDir, "src/db/schema/index.js"), `module.exports = require('./users');`);
    const result = detectDbSchemaFiles(tmpDir, ["src"], "drizzle", "{js,jsx}");
    expect(result.detected).toBe(true);
    expect(result.filePattern).toBe("src/db/schema/**/*.{js,jsx}");
  });

  it("drizzle avec répertoire dans drizzle.config.ts → glob récursif", () => {
    writeFileSync(
      join(tmpDir, "drizzle.config.ts"),
      `export default defineConfig({ schema: './src/db/schema' });`,
    );
    mkdirSync(join(tmpDir, "src/db/schema"), { recursive: true });
    touch(join(tmpDir, "src/db/schema/users.ts"), "");
    const result = detectDbSchemaFiles(tmpDir, ["src"], "drizzle", "{ts,tsx}");
    expect(result.detected).toBe(true);
    // Les répertoires utilisent maintenant /**/*.ext
    expect(result.filePattern).toBe("src/db/schema/**/*.{ts,tsx}");
  });
});

/* ------------------------------------------------------------------ */
/*  detectHookFiles                                                    */
/* ------------------------------------------------------------------ */

describe("detectHookFiles", () => {
  it("dossier hooks/ → detected: true", () => {
    touch(join(tmpDir, "src/hooks/useAuth.ts"), "");
    const result = detectHookFiles(tmpDir, ["src"]);
    expect(result.detected).toBe(true);
    expect(result.filePattern).toBe("src/hooks/**/*.{ts,tsx,js,jsx}");
  });

  it("dossier composables/ → detected: true", () => {
    touch(join(tmpDir, "src/composables/useAuth.ts"), "");
    const result = detectHookFiles(tmpDir, ["src"]);
    expect(result.detected).toBe(true);
    expect(result.filePattern).toBe("src/composables/**/*.{ts,js}");
  });

  it("rien → detected: false", () => {
    touch(join(tmpDir, "src/index.ts"), "");
    const result = detectHookFiles(tmpDir, ["src"]);
    expect(result.detected).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  scanProject — intégration                                         */
/* ------------------------------------------------------------------ */

describe("scanProject — projet Express+JS avec fichiers routes au root", () => {
  it("détecte correctement le langage, les routes et la DB", () => {
    writePkg({ express: "^4.18.0", knex: "^2.5.0", bookshelf: "^1.2.0" });
    touch(join(tmpDir, "app/routes.js"), "");
    touch(join(tmpDir, "app/routes-v2.js"), "");
    touch(join(tmpDir, "app/controllers/v1/user.js"), "");
    touch(join(tmpDir, "app/services/auth.js"), "");
    touch(join(tmpDir, "app/models/user.js"), "");
    mkdirSync(join(tmpDir, "migrations"), { recursive: true });
    touch(join(tmpDir, "migrations/001_init.js"), "");

    const scan = scanProject(tmpDir, { express: "^4.18.0", knex: "^2.5.0", bookshelf: "^1.2.0" });

    expect(scan.language).toBe("javascript");
    expect(scan.sourceRoots).toContain("app");
    expect(scan.include.some((p) => p.includes("app/**/*.js"))).toBe(true);
    expect(scan.routes.detected).toBe(true);
    expect(scan.routes.filePattern).toBe("app/routes*.{js,jsx}");
    expect(scan.dbSchema.detected).toBe(true);
    expect(scan.dbSchema.filePattern).toBe("migrations/**/*.{js,jsx}");
  });
});

describe("scanProject — projet Express+TS avec dossier routes", () => {
  it("détecte correctement le langage, les routes et la DB", () => {
    writePkg({ express: "^4.18.0", knex: "^2.5.0" });
    touch(join(tmpDir, "tsconfig.json"), "{}");
    touch(join(tmpDir, "src/routes/index.ts"), "");
    touch(join(tmpDir, "src/controllers/user.ts"), "");
    touch(join(tmpDir, "src/services/db.ts"), "");
    mkdirSync(join(tmpDir, "migrations"), { recursive: true });
    touch(join(tmpDir, "migrations/001_init.ts"), "");

    const scan = scanProject(tmpDir, { express: "^4.18.0", knex: "^2.5.0" });

    expect(scan.language).toBe("typescript");
    expect(scan.sourceRoots).toContain("src");
    expect(scan.include.some((p) => p.includes("src/**/*.ts"))).toBe(true);
    expect(scan.routes.detected).toBe(true);
    expect(scan.routes.filePattern).toBe("src/routes/**/*.{ts,tsx}");
    expect(scan.dbSchema.detected).toBe(true);
    expect(scan.dbSchema.filePattern).toBe("migrations/**/*.{ts,tsx}");
  });
});

describe("scanProject — projet Koa+TS avec routes imbriquées", () => {
  it("détecte correctement le langage et les routes profondes", () => {
    writePkg({ koa: "^2.14.0", "koa-router": "^12.0.0" });
    touch(join(tmpDir, "tsconfig.json"), "{}");
    touch(join(tmpDir, "app/routes/dashboards/v1/dashboards.ts"), "");
    touch(join(tmpDir, "app/routes/widgets/v1/GetWidgets.ts"), "");
    touch(join(tmpDir, "app/services/db.ts"), "");

    const scan = scanProject(tmpDir, { koa: "^2.14.0", "koa-router": "^12.0.0" });

    expect(scan.language).toBe("typescript");
    expect(scan.sourceRoots).toContain("app");
    expect(scan.include.some((p) => p.includes("app/**/*.ts"))).toBe(true);
    expect(scan.routes.detected).toBe(true);
    expect(scan.routes.filePattern).toBe("app/routes/**/*.{ts,tsx}");
    expect(scan.dbSchema.detected).toBe(false);
  });
});

describe("scanProject — framework hints", () => {
  it("Next.js détecté → frameworkHints.isNextJs + routes app/api/", () => {
    writePkg({ next: "^14.0.0", react: "^18.0.0" });
    touch(join(tmpDir, "tsconfig.json"), "{}");
    touch(join(tmpDir, "app/api/users/route.ts"), "");
    touch(join(tmpDir, "app/page.tsx"), "");

    const scan = scanProject(tmpDir, { next: "^14.0.0", react: "^18.0.0" });
    expect(scan.frameworkHints?.isNextJs).toBe(true);
    expect(scan.routes.detected).toBe(true);
    expect(scan.routes.filePattern).toContain("app/api/");
  });

  it("NestJS détecté → frameworkHints.isNestJs + patterns NestJS", () => {
    writePkg({ "@nestjs/core": "^10.0.0", express: "^4.18.0" });
    touch(join(tmpDir, "tsconfig.json"), "{}");
    touch(join(tmpDir, "src/index.ts"), "");

    const scan = scanProject(tmpDir, { "@nestjs/core": "^10.0.0", express: "^4.18.0" });
    expect(scan.frameworkHints?.isNestJs).toBe(true);
    const sp = scan.functions.servicePattern;
    expect(Array.isArray(sp)).toBe(true);
    if (Array.isArray(sp)) {
      expect(sp).toContain("**/*.service.{ts,tsx}");
      expect(sp).toContain("**/*.controller.{ts,tsx}");
    }
  });

  it("pas de framework → pas de frameworkHints", () => {
    const scan = scanProject(tmpDir, {});
    expect(scan.frameworkHints).toBeUndefined();
  });
});

describe("scanProject — cas limites", () => {
  it("projet vide → defaults raisonnables", () => {
    const scan = scanProject(tmpDir, {});

    expect(scan.language).toBe("typescript");
    expect(scan.sourceRoots).toEqual(["."]);
    expect(scan.routes.detected).toBe(false);
    expect(scan.dbSchema.detected).toBe(false);
    expect(scan.hooks.detected).toBe(false);
  });

  it("source au root (pas de src/) → include sans préfixe", () => {
    touch(join(tmpDir, "tsconfig.json"), "{}");
    touch(join(tmpDir, "index.ts"), "");
    touch(join(tmpDir, "server.ts"), "");

    const scan = scanProject(tmpDir, {});
    expect(scan.sourceRoots).toEqual(["."]);
    expect(scan.include.some((p) => p === "**/*.ts")).toBe(true);
  });

  it("projet mixte JS/TS → include couvre les deux", () => {
    touch(join(tmpDir, "tsconfig.json"), "{}");
    touch(join(tmpDir, "src/config.ts"), "");
    touch(join(tmpDir, "src/app.js"), "");
    touch(join(tmpDir, "src/routes.js"), "");
    touch(join(tmpDir, "src/more.js"), "");

    const scan = scanProject(tmpDir, {});
    expect(scan.language).toBe("typescript");
    expect(scan.include.some((p) => p.includes("*.ts"))).toBe(true);
    expect(scan.include.some((p) => p.includes("*.js"))).toBe(true);
  });
});
