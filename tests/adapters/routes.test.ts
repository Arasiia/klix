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

  it("pas de double slash quand apiPrefix='/' et routePrefix='/accounts'", () => {
    const content = `const app = new Elysia({ prefix: '/accounts' })\n  .get('/', h)\n  .get('/:id', h)`;
    const routes = elysiaAdapter.extract(content, FILE, "/");
    expect(routes.every((r) => !r.path.includes("//"))).toBe(true);
    expect(routes.some((r) => r.path === "/accounts/")).toBe(true);
    expect(routes.some((r) => r.path === "/accounts/:id")).toBe(true);
  });

  it("apiPrefix '/api' + routePrefix '/users' → /api/users/... sans double slash", () => {
    const content = `const app = new Elysia({ prefix: '/users' })\n  .get('/', h)\n  .post('/', h)`;
    const routes = elysiaAdapter.extract(content, FILE, "/api");
    expect(routes.every((r) => !r.path.includes("//"))).toBe(true);
    expect(routes.some((r) => r.path === "/api/users/")).toBe(true);
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

  it("applique le apiPrefix au path", () => {
    const routes = expressAdapter.extract(`router.get('/test', h)`, FILE, "/api");
    expect(routes[0].path).toBe("/api/test");
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

  it("le defaultFilePattern inclut routes/ et controllers/", () => {
    expect(expressAdapter.defaultFilePattern).toBe("**/{routes,controllers}/**/*.{ts,js}");
  });

  it("détecte app.all('/path', handler)", () => {
    const routes = expressAdapter.extract(`app.all('/health', healthCheck);`, FILE, "");
    expect(routes).toHaveLength(1);
    expect(routes[0].method).toBe("ALL");
    expect(routes[0].path).toBe("/health");
  });

  it("détecte router.options('/path', handler)", () => {
    const routes = expressAdapter.extract(`router.options('/cors', corsHandler);`, FILE, "");
    expect(routes).toHaveLength(1);
    expect(routes[0].method).toBe("OPTIONS");
  });

  it("détecte app.head('/path', handler)", () => {
    const routes = expressAdapter.extract(`app.head('/ping', pingHandler);`, FILE, "");
    expect(routes).toHaveLength(1);
    expect(routes[0].method).toBe("HEAD");
  });

  it("détecte une route avec wildcard (:site_id*)", () => {
    const routes = expressAdapter.extract(`app.get('/v1/sites/:site_id*', handler);`, FILE, "");
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toContain(":site_id");
  });

  it("détecte une route avec middleware chain long", () => {
    const routes = expressAdapter.extract(
      `router.post('/users', auth, validate, userController.create);`,
      FILE,
      "",
    );
    expect(routes).toHaveLength(1);
    expect(routes[0].method).toBe("POST");
    expect(routes[0].path).toBe("/users");
  });

  it("extrait le handler depuis une middleware chain", () => {
    const routes = expressAdapter.extract(
      `router.get('/users', auth, userController.getAll);`,
      FILE,
      "",
    );
    expect(routes).toHaveLength(1);
    expect(routes[0].handler).toBe("userController.getAll");
  });

  it("ignore les handlers de type cleanResponse/sendJSON", () => {
    const routes = expressAdapter.extract(
      `router.get('/users', getAll, cleanResponse);`,
      FILE,
      "",
    );
    expect(routes).toHaveLength(1);
    expect(routes[0].handler).toBe("getAll");
  });

  it("supprime .bind() du handler", () => {
    const routes = expressAdapter.extract(
      `router.get('/users', ctrl.list.bind(ctrl));`,
      FILE,
      "",
    );
    expect(routes).toHaveLength(1);
    expect(routes[0].handler).toBe("ctrl.list");
  });

  it("apiPrefix est pris en compte", () => {
    const routes = expressAdapter.extract(`router.get('/users', handler);`, FILE, "/api/v2");
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe("/api/v2/users");
  });

  it("apiPrefix '/' ne modifie pas le path", () => {
    const routes = expressAdapter.extract(`router.get('/users', handler);`, FILE, "/");
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe("/users");
  });

  it("apiPrefix + path ne produit pas de double slash", () => {
    const routes = expressAdapter.extract(`router.get('/users', handler);`, FILE, "/api");
    expect(routes[0].path).toBe("/api/users");
    expect(routes[0].path).not.toMatch(/\/\//);
  });

  it("détecte une route multi-lignes avec middleware chain", () => {
    const content = `app.get('/v1/me',
    blueprintValidator.uriValidator,
    blueprintValidator.queryValidator,
    loadUser(),
    userController.getMe.bind(userController),
    cleanResponse,
    sendJSON
  )`;
    const routes = expressAdapter.extract(content, FILE, "");
    expect(routes).toHaveLength(1);
    expect(routes[0].method).toBe("GET");
    expect(routes[0].path).toBe("/v1/me");
    expect(routes[0].handler).toBe("userController.getMe");
  });

  it("détecte plusieurs routes multi-lignes consécutives", () => {
    const content = `
  app.get('/v1/users',
    loadUser(),
    userController.getAll.bind(userController),
    cleanResponse,
    sendJSON
  )
  app.post('/v1/users',
    loadUser(),
    userController.create.bind(userController),
    cleanResponse,
    sendJSON
  )
  app.delete('/v1/users/:id',
    loadUser(),
    userController.delete.bind(userController),
    cleanResponse,
    sendJSON
  )`;
    const routes = expressAdapter.extract(content, FILE, "");
    expect(routes).toHaveLength(3);
    expect(routes[0].method).toBe("GET");
    expect(routes[0].handler).toBe("userController.getAll");
    expect(routes[1].method).toBe("POST");
    expect(routes[1].handler).toBe("userController.create");
    expect(routes[2].method).toBe("DELETE");
    expect(routes[2].handler).toBe("userController.delete");
  });

  it("handler extrait correctement quand middleware contient des parenthèses", () => {
    const content = `app.get('/v1/sites',
    authorize(['sites_crud']),
    loadAirportClient(true),
    siteController.getAll.bind(siteController),
    cleanResponse,
    sendJSON
  )`;
    const routes = expressAdapter.extract(content, FILE, "");
    expect(routes).toHaveLength(1);
    expect(routes[0].handler).toBe("siteController.getAll");
  });

  it("route multi-lignes sans handler identifiable → handler undefined", () => {
    const content = `app.get('/admin/status', function (req, res) {
    res.json({ status: 'ok' })
  })`;
    const routes = expressAdapter.extract(content, FILE, "");
    expect(routes).toHaveLength(1);
    expect(routes[0].handler).toBeUndefined();
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
