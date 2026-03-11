import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { extractElysiaRoutes, extractExpressRoutes, runRoutesIndexer } from "../../src/indexers/routes.indexer";
import { DEFAULT_CONFIG } from "../../src/lib/config";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "klix-routes-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("extractElysiaRoutes", () => {
  const file = "/fake/users.routes.ts";
  const prefix = "/api";

  it("extrait une route GET simple", () => {
    const content = `.get('/users', ({ set }) => { set.status = 200; })`;
    const routes = extractElysiaRoutes(content, file, prefix);
    expect(routes.some((r) => r.method === "GET" && r.path === "/api/users")).toBe(true);
  });

  it("extrait plusieurs méthodes HTTP", () => {
    const content = `
      .get('/users', handler)
      .post('/users', handler)
      .delete('/users/:id', handler)
    `;
    const routes = extractElysiaRoutes(content, file, prefix);
    expect(routes.some((r) => r.method === "GET")).toBe(true);
    expect(routes.some((r) => r.method === "POST")).toBe(true);
    expect(routes.some((r) => r.method === "DELETE")).toBe(true);
  });

  it("utilise le prefix du routeur Elysia", () => {
    const content = `
      const app = new Elysia({ prefix: '/users' })
        .get('/', handler)
        .post('/', handler)
    `;
    const routes = extractElysiaRoutes(content, file, prefix);
    expect(routes.some((r) => r.path === "/api/users/")).toBe(true);
  });

  it("extrait le body depuis t.Object", () => {
    const content = `
      const createBody = t.Object({
        name: t.String(),
        email: t.String(),
      })
      .post('/users', handler, { body: createBody })
    `;
    const routes = extractElysiaRoutes(content, file, prefix);
    const post = routes.find((r) => r.method === "POST");
    expect(post?.body).toContain("name");
    expect(post?.body).toContain("email");
  });

  it("retourne tableau vide si pas de routes", () => {
    const content = `const x = 1;`;
    const routes = extractElysiaRoutes(content, file, prefix);
    expect(routes).toHaveLength(0);
  });

  it("extrait les routes PUT et PATCH", () => {
    const content = `
      .put('/users/:id', handler)
      .patch('/users/:id', handler)
    `;
    const routes = extractElysiaRoutes(content, file, prefix);
    expect(routes.some((r) => r.method === "PUT")).toBe(true);
    expect(routes.some((r) => r.method === "PATCH")).toBe(true);
  });
});

describe("extractExpressRoutes", () => {
  const file = "/fake/users.routes.ts";

  it("extrait une route GET Express", () => {
    const content = `router.get('/users', controller.getAll);`;
    const routes = extractExpressRoutes(content, file);
    expect(routes.some((r) => r.method === "GET" && r.path === "/users")).toBe(true);
  });

  it("extrait les méthodes POST, PUT, DELETE, PATCH", () => {
    const content = `
      router.post('/users', create);
      router.put('/users/:id', update);
      router.delete('/users/:id', remove);
      router.patch('/users/:id', patch);
    `;
    const routes = extractExpressRoutes(content, file);
    expect(routes.some((r) => r.method === "POST")).toBe(true);
    expect(routes.some((r) => r.method === "PUT")).toBe(true);
    expect(routes.some((r) => r.method === "DELETE")).toBe(true);
    expect(routes.some((r) => r.method === "PATCH")).toBe(true);
  });

  it("retourne tableau vide si pas de routes", () => {
    const content = `const x = express();`;
    const routes = extractExpressRoutes(content, file);
    expect(routes).toHaveLength(0);
  });
});

describe("runRoutesIndexer", () => {
  it("génère le header avec le nom du projet", () => {
    const config = {
      ...DEFAULT_CONFIG,
      name: "test-app",
      indexers: {
        ...DEFAULT_CONFIG.indexers,
        routes: {
          enabled: true,
          framework: "express",
          apiPrefix: "/api",
          filePattern: "**/*.routes.ts",
        },
      },
    };
    const output = runRoutesIndexer(tmpDir, config);
    expect(output).toContain("# API ROUTES — test-app");
    expect(output).toContain("framework: express");
  });

  it("indexe les routes Express depuis des fichiers réels", () => {
    mkdirSync(join(tmpDir, "src"));
    writeFileSync(
      join(tmpDir, "src", "users.routes.ts"),
      `
        const router = express.Router();
        router.get('/users', ctrl.getAll);
        router.post('/users', ctrl.create);
      `,
    );
    const config = {
      ...DEFAULT_CONFIG,
      indexers: {
        ...DEFAULT_CONFIG.indexers,
        routes: {
          enabled: true,
          framework: "express",
          apiPrefix: "/api",
          filePattern: "src/**/*.routes.ts",
        },
      },
      exclude: [],
    };
    const output = runRoutesIndexer(tmpDir, config);
    expect(output).toContain("`GET`");
    expect(output).toContain("`POST`");
    expect(output).toContain("/users");
  });

  it("groupe par ressource (premier segment)", () => {
    mkdirSync(join(tmpDir, "src"));
    writeFileSync(
      join(tmpDir, "src", "api.routes.ts"),
      `
        const router = express.Router();
        router.get('/users', ctrl.getAll);
        router.get('/posts', ctrl.getPosts);
      `,
    );
    const config = {
      ...DEFAULT_CONFIG,
      indexers: {
        ...DEFAULT_CONFIG.indexers,
        routes: {
          enabled: true,
          framework: "express",
          apiPrefix: "",
          filePattern: "src/**/*.routes.ts",
        },
      },
      exclude: [],
    };
    const output = runRoutesIndexer(tmpDir, config);
    expect(output).toContain("## /users");
    expect(output).toContain("## /posts");
  });

  it("trie les méthodes GET avant POST avant DELETE", () => {
    mkdirSync(join(tmpDir, "src"));
    writeFileSync(
      join(tmpDir, "src", "users.routes.ts"),
      `
        const router = express.Router();
        router.delete('/users/:id', ctrl.delete);
        router.post('/users', ctrl.create);
        router.get('/users', ctrl.getAll);
      `,
    );
    const config = {
      ...DEFAULT_CONFIG,
      indexers: {
        ...DEFAULT_CONFIG.indexers,
        routes: {
          enabled: true,
          framework: "express",
          apiPrefix: "",
          filePattern: "src/**/*.routes.ts",
        },
      },
      exclude: [],
    };
    const output = runRoutesIndexer(tmpDir, config);
    const getIdx = output.indexOf("`GET`");
    const postIdx = output.indexOf("`POST`");
    const deleteIdx = output.indexOf("`DELETE`");
    expect(getIdx).toBeLessThan(postIdx);
    expect(postIdx).toBeLessThan(deleteIdx);
  });
});
