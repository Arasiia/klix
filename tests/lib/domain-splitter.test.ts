import { describe, it, expect } from "bun:test";
import { extractDomain } from "../../src/lib/domain-splitter";

describe("extractDomain — depth=1 (compatibilité totale avec l'existant)", () => {
  it("src/auth/user.service.ts → 'auth'", () => {
    expect(extractDomain("src/auth/user.service.ts")).toBe("auth");
  });

  it("server/src/db/schema/user.ts → 'db'", () => {
    expect(extractDomain("server/src/db/schema/user.ts")).toBe("db");
  });

  it("src/index.ts → 'root' (pas de sous-dossier)", () => {
    expect(extractDomain("src/index.ts")).toBe("root");
  });

  it("src/lib/config.ts → 'root' (premier dossier dans SKIP_SEGMENTS)", () => {
    expect(extractDomain("src/lib/config.ts")).toBe("root");
  });

  it("src/modules/accounts/accounts.service.ts → 'modules'", () => {
    expect(extractDomain("src/modules/accounts/accounts.service.ts")).toBe("modules");
  });

  it("client/src/hooks/use-auth.ts → 'hooks'", () => {
    expect(extractDomain("client/src/hooks/use-auth.ts")).toBe("hooks");
  });

  it("./src/routes/user.routes.ts → 'routes' (préfixe ./ géré)", () => {
    expect(extractDomain("./src/routes/user.routes.ts")).toBe("routes");
  });
});

describe("extractDomain — depth=2", () => {
  it("src/modules/accounts/accounts.service.ts → 'modules.accounts'", () => {
    expect(extractDomain("src/modules/accounts/accounts.service.ts", 2)).toBe("modules.accounts");
  });

  it("src/modules/auth/auth.service.ts → 'modules.auth'", () => {
    expect(extractDomain("src/modules/auth/auth.service.ts", 2)).toBe("modules.auth");
  });

  it("src/api/accounts.api.ts → 'api.accounts'", () => {
    expect(extractDomain("src/api/accounts.api.ts", 2)).toBe("api.accounts");
  });

  it("src/hooks/use-accounts.ts → 'hooks.use-accounts'", () => {
    expect(extractDomain("src/hooks/use-accounts.ts", 2)).toBe("hooks.use-accounts");
  });

  it("src/auth/auth.service.ts → 'auth' (dédup : auth == auth)", () => {
    expect(extractDomain("src/auth/auth.service.ts", 2)).toBe("auth");
  });

  it("src/index.ts → 'root' (pas de sous-dossier)", () => {
    expect(extractDomain("src/index.ts", 2)).toBe("root");
  });

  it("src/orders/orders.routes.ts → 'orders' (dédup)", () => {
    expect(extractDomain("src/orders/orders.routes.ts", 2)).toBe("orders");
  });

  it("server/src/modules/users/users.controller.ts → 'modules.users'", () => {
    expect(extractDomain("server/src/modules/users/users.controller.ts", 2)).toBe("modules.users");
  });

  it("src/features/billing/billing.handler.ts → 'features.billing'", () => {
    expect(extractDomain("src/features/billing/billing.handler.ts", 2)).toBe("features.billing");
  });
});

describe("extractDomain — stripping de suffixes connus (depth=2)", () => {
  it("strip .service", () => {
    expect(extractDomain("src/domain/sub/foo.service.ts", 2)).toBe("domain.sub");
  });

  it("strip .routes", () => {
    expect(extractDomain("src/api/foo.routes.ts", 2)).toBe("api.foo");
  });

  it("strip .controller", () => {
    expect(extractDomain("src/modules/x/x.controller.ts", 2)).toBe("modules.x");
  });

  it("strip .repository", () => {
    expect(extractDomain("src/domain/x.repository.ts", 2)).toBe("domain.x");
  });

  it("strip .adapter", () => {
    expect(extractDomain("src/infra/db.adapter.ts", 2)).toBe("infra.db");
  });
});

describe("extractDomain — cas root (depth=2)", () => {
  it("fichier sans sous-dossier → root", () => {
    expect(extractDomain("index.ts", 2)).toBe("root");
  });

  it("src/index.ts → root", () => {
    expect(extractDomain("src/index.ts", 2)).toBe("root");
  });

  it("src/lib/config.ts → 'config' (SKIP 'lib', prend le fichier)", () => {
    expect(extractDomain("src/lib/config.ts", 2)).toBe("config");
  });
});
