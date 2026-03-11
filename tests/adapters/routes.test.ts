import { describe, it, expect } from "bun:test";
import { elysiaAdapter } from "../../src/adapters/routes/elysia.adapter";
import { expressAdapter } from "../../src/adapters/routes/express.adapter";
import { koaAdapter } from "../../src/adapters/routes/koa.adapter";

const FILE = "/fake/users.routes.ts";
const PREFIX = "/api";

describe("elysiaAdapter", () => {
  it("a les métadonnées correctes", () => {
    expect(elysiaAdapter.id).toBe("elysia");
    expect(elysiaAdapter.packages).toContain("elysia");
    expect(elysiaAdapter.defaultFilePattern).toBeTruthy();
  });

  it("extrait une route GET simple", () => {
    const routes = elysiaAdapter.extract(`.get('/users', handler)`, FILE, PREFIX);
    expect(routes.some((r) => r.method === "GET" && r.path === "/api/users")).toBe(true);
  });

  it("extrait plusieurs méthodes HTTP", () => {
    const content = `.get('/users', h)\n.post('/users', h)\n.delete('/users/:id', h)`;
    const routes = elysiaAdapter.extract(content, FILE, PREFIX);
    expect(routes.some((r) => r.method === "GET")).toBe(true);
    expect(routes.some((r) => r.method === "POST")).toBe(true);
    expect(routes.some((r) => r.method === "DELETE")).toBe(true);
  });

  it("utilise le prefix du routeur Elysia", () => {
    const content = `const app = new Elysia({ prefix: '/users' })\n  .get('/', handler)`;
    const routes = elysiaAdapter.extract(content, FILE, PREFIX);
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
    const routes = elysiaAdapter.extract(content, FILE, PREFIX);
    const post = routes.find((r) => r.method === "POST");
    expect(post?.body).toContain("name");
    expect(post?.body).toContain("email");
  });

  it("retourne tableau vide si pas de routes", () => {
    expect(elysiaAdapter.extract("const x = 1;", FILE, PREFIX)).toHaveLength(0);
  });

  it("extrait PUT et PATCH", () => {
    const content = `.put('/users/:id', h)\n.patch('/users/:id', h)`;
    const routes = elysiaAdapter.extract(content, FILE, PREFIX);
    expect(routes.some((r) => r.method === "PUT")).toBe(true);
    expect(routes.some((r) => r.method === "PATCH")).toBe(true);
  });

  it("le file est un chemin relatif", () => {
    const routes = elysiaAdapter.extract(`.get('/test', h)`, FILE, PREFIX);
    expect(routes[0].file).not.toContain("\\");
  });
});

describe("expressAdapter", () => {
  it("a les métadonnées correctes", () => {
    expect(expressAdapter.id).toBe("express");
    expect(expressAdapter.packages).toContain("express");
    expect(expressAdapter.defaultFilePattern).toBeTruthy();
  });

  it("extrait une route GET Express", () => {
    const routes = expressAdapter.extract(`router.get('/users', ctrl.getAll);`, FILE, "");
    expect(routes.some((r) => r.method === "GET" && r.path === "/users")).toBe(true);
  });

  it("extrait POST, PUT, DELETE, PATCH", () => {
    const content = `
      router.post('/users', create);
      router.put('/users/:id', update);
      router.delete('/users/:id', remove);
      router.patch('/users/:id', patch);
    `;
    const routes = expressAdapter.extract(content, FILE, "");
    expect(routes.some((r) => r.method === "POST")).toBe(true);
    expect(routes.some((r) => r.method === "PUT")).toBe(true);
    expect(routes.some((r) => r.method === "DELETE")).toBe(true);
    expect(routes.some((r) => r.method === "PATCH")).toBe(true);
  });

  it("retourne tableau vide si pas de routes", () => {
    expect(expressAdapter.extract("const x = express();", FILE, "")).toHaveLength(0);
  });

  it("ignore le apiPrefix (Express gère son propre préfixe)", () => {
    const routes = expressAdapter.extract(`router.get('/test', h)`, FILE, "/api");
    expect(routes[0].path).toBe("/test");
  });

  it("détecte app.get('/path', handler)", () => {
    const routes = expressAdapter.extract(`app.get('/users', getUsers);`, FILE, "");
    expect(routes.some((r) => r.method === "GET" && r.path === "/users")).toBe(true);
  });

  it("détecte server.post('/path', handler)", () => {
    const routes = expressAdapter.extract(`server.post('/login', login);`, FILE, "");
    expect(routes.some((r) => r.method === "POST" && r.path === "/login")).toBe(true);
  });

  it("détecte un mélange router.get + app.post", () => {
    const content = `
      router.get('/users', list);
      app.post('/users', create);
    `;
    const routes = expressAdapter.extract(content, FILE, "");
    expect(routes).toHaveLength(2);
    expect(routes.some((r) => r.method === "GET" && r.path === "/users")).toBe(true);
    expect(routes.some((r) => r.method === "POST" && r.path === "/users")).toBe(true);
  });

  it("ignore .get('nonPathString') sans slash initial", () => {
    const content = `cache.get('userKey');\nmap.delete('item');`;
    const routes = expressAdapter.extract(content, FILE, "");
    expect(routes).toHaveLength(0);
  });

  it("détecte la route racine '/'", () => {
    const routes = expressAdapter.extract(`app.get('/', index);`, FILE, "");
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe("/");
  });

  it("détecte les routes avec des double quotes", () => {
    const routes = expressAdapter.extract(`app.get("/users", handler);`, FILE, "");
    expect(routes.some((r) => r.method === "GET" && r.path === "/users")).toBe(true);
  });

  it("détecte les routes avec espaces après la parenthèse", () => {
    const routes = expressAdapter.extract(`router.get(  '/users' , handler);`, FILE, "");
    expect(routes.some((r) => r.method === "GET" && r.path === "/users")).toBe(true);
  });

  it("détecte express().get('/path')", () => {
    const routes = expressAdapter.extract(`express().get('/health', h);`, FILE, "");
    expect(routes.some((r) => r.method === "GET" && r.path === "/health")).toBe(true);
  });

  it("détecte les routes chaînées", () => {
    const content = `app.get('/a', h1).post('/b', h2);`;
    const routes = expressAdapter.extract(content, FILE, "");
    expect(routes).toHaveLength(2);
    expect(routes[0].method).toBe("GET");
    expect(routes[1].method).toBe("POST");
  });

  it("ignore les méthodes en majuscules (router.GET)", () => {
    const routes = expressAdapter.extract(`router.GET('/users', h);`, FILE, "");
    expect(routes).toHaveLength(0);
  });

  it("détecte les routes avec paramètres", () => {
    const routes = expressAdapter.extract(`app.delete('/users/:id/posts/:postId', h);`, FILE, "");
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe("/users/:id/posts/:postId");
  });

  it("le defaultFilePattern inclut .js et .ts", () => {
    expect(expressAdapter.defaultFilePattern).toBe("**/routes/**/*.{ts,js}");
  });
});

describe("elysiaAdapter — couverture étendue", () => {
  it("extrait un prefix multi-segments", () => {
    const content = `const app = new Elysia({ prefix: '/v1/api' })\n  .get('/users', handler)`;
    const routes = elysiaAdapter.extract(content, FILE, "");
    expect(routes[0].path).toBe("/v1/api/users");
  });

  it("fonctionne sans prefix dans le constructeur Elysia", () => {
    const content = `const app = new Elysia()\n  .get('/users', handler)`;
    const routes = elysiaAdapter.extract(content, FILE, PREFIX);
    expect(routes[0].path).toBe("/api/users");
  });

  it("constructeur Elysia avec d'autres options sans prefix", () => {
    const content = `const app = new Elysia({ name: 'myApp' })\n  .get('/users', handler)`;
    const routes = elysiaAdapter.extract(content, FILE, "");
    expect(routes[0].path).toBe("/users");
  });

  it("body avec plusieurs champs", () => {
    const content = `
      const createBody = t.Object({
        name: t.String(),
        email: t.String(),
        age: t.Number(),
      })
      .post('/users', handler, { body: createBody })
    `;
    const routes = elysiaAdapter.extract(content, FILE, "");
    const post = routes.find((r) => r.method === "POST");
    expect(post?.body).toContain("name");
    expect(post?.body).toContain("email");
    expect(post?.body).toContain("age");
  });

  it("route sans body n'a pas de champ body", () => {
    const routes = elysiaAdapter.extract(`.get('/health', handler)`, FILE, "");
    expect(routes[0].body).toBeUndefined();
  });

  it("référence body variable inexistante → body undefined", () => {
    const content = `.post('/users', handler, { body: unknownBody })`;
    const routes = elysiaAdapter.extract(content, FILE, "");
    expect(routes[0].body).toBeUndefined();
  });

  it("route avec path vide", () => {
    const content = `const app = new Elysia({ prefix: '/users' })\n  .get('', handler)`;
    const routes = elysiaAdapter.extract(content, FILE, PREFIX);
    expect(routes[0].path).toBe("/api/users");
  });

  it("extrait avec double quotes", () => {
    const routes = elysiaAdapter.extract(`.get("/users", handler)`, FILE, PREFIX);
    expect(routes[0].path).toBe("/api/users");
  });

  it("prefix avec double quotes", () => {
    const content = `const app = new Elysia({ prefix: "/admin" })\n  .get('/dashboard', handler)`;
    const routes = elysiaAdapter.extract(content, FILE, "");
    expect(routes[0].path).toBe("/admin/dashboard");
  });

  it("le file est un chemin relatif sans backslash", () => {
    const routes = elysiaAdapter.extract(`.get('/test', h)`, FILE, "");
    expect(routes[0].file).not.toContain("\\");
  });
});

describe("koaAdapter", () => {
  it("a les métadonnées correctes", () => {
    expect(koaAdapter.id).toBe("koa");
    expect(koaAdapter.packages).toContain("@koa/router");
    expect(koaAdapter.defaultFilePattern).toBeTruthy();
  });

  it("extrait une route GET simple sans nom", () => {
    const routes = koaAdapter.extract(`router.get('/users', handler)`, FILE, PREFIX);
    expect(routes.some((r) => r.method === "GET" && r.path === "/users")).toBe(true);
  });

  it("extrait une route avec nom (syntaxe Koa)", () => {
    const routes = koaAdapter.extract(`router.get('userList', '/users', handler)`, FILE, PREFIX);
    expect(routes.some((r) => r.method === "GET" && r.path === "/users")).toBe(true);
  });

  it("extrait plusieurs méthodes HTTP (POST, PUT, DELETE, PATCH)", () => {
    const content = `
      router.post('/users', create);
      router.put('/users/:id', update);
      router.delete('/users/:id', remove);
      router.patch('/users/:id', patch);
    `;
    const routes = koaAdapter.extract(content, FILE, PREFIX);
    expect(routes.some((r) => r.method === "POST")).toBe(true);
    expect(routes.some((r) => r.method === "PUT")).toBe(true);
    expect(routes.some((r) => r.method === "DELETE")).toBe(true);
    expect(routes.some((r) => r.method === "PATCH")).toBe(true);
  });

  it("retourne tableau vide si pas de routes", () => {
    expect(koaAdapter.extract("const app = new Koa();", FILE, PREFIX)).toHaveLength(0);
  });

  it("extrait un route name avec tirets", () => {
    const routes = koaAdapter.extract(`router.get('user-list', '/users', handler)`, FILE, PREFIX);
    expect(routes.some((r) => r.method === "GET" && r.path === "/users")).toBe(true);
  });

  it("extrait un route name avec underscores", () => {
    const routes = koaAdapter.extract(`router.post('create_user', '/users', handler)`, FILE, PREFIX);
    expect(routes.some((r) => r.method === "POST" && r.path === "/users")).toBe(true);
  });

  it("gère les espaces autour des arguments", () => {
    const routes = koaAdapter.extract(`router.get(  '/users'  , handler)`, FILE, PREFIX);
    expect(routes.some((r) => r.method === "GET" && r.path === "/users")).toBe(true);
  });

  it("extrait les routes avec double quotes", () => {
    const routes = koaAdapter.extract(`router.get("/users", handler)`, FILE, PREFIX);
    expect(routes.some((r) => r.method === "GET" && r.path === "/users")).toBe(true);
  });

  it("détecte les routes avec paramètres", () => {
    const routes = koaAdapter.extract(`router.get('/users/:id', handler)`, FILE, PREFIX);
    expect(routes[0].path).toBe("/users/:id");
  });

  it("le file est un chemin relatif sans backslash", () => {
    const routes = koaAdapter.extract(`router.get('/test', h)`, FILE, PREFIX);
    expect(routes[0].file).not.toContain("\\");
  });
});
