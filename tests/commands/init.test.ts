import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { detectWorkspaces, detectDomainDepth } from "../../src/commands/init.cmd";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "klix-init-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function createWorkspace(dir: string, name: string) {
  mkdirSync(join(tmpDir, dir), { recursive: true });
  writeFileSync(join(tmpDir, dir, "package.json"), JSON.stringify({ name }));
}

function writePkg(workspaces: string[]) {
  writeFileSync(join(tmpDir, "package.json"), JSON.stringify({ workspaces }));
}

describe("detectWorkspaces — chemins sans glob", () => {
  it("workspaces: ['server', 'client'] → les deux détectés", () => {
    createWorkspace("server", "server");
    createWorkspace("client", "client");
    writePkg(["server", "client"]);
    const result = detectWorkspaces(tmpDir);
    expect(result).toContain("server");
    expect(result).toContain("client");
  });

  it("workspace inexistant → exclu", () => {
    createWorkspace("server", "server");
    writePkg(["server", "nonexistent"]);
    const result = detectWorkspaces(tmpDir);
    expect(result).toContain("server");
    expect(result).not.toContain("nonexistent");
  });
});

describe("detectWorkspaces — patterns glob", () => {
  it("workspaces: ['packages/*'] → résout les packages réels", () => {
    createWorkspace("packages/api", "@app/api");
    createWorkspace("packages/web", "@app/web");
    writePkg(["packages/*"]);
    const result = detectWorkspaces(tmpDir);
    expect(result).toContain("packages/api");
    expect(result).toContain("packages/web");
  });

  it("workspaces: ['apps/*', 'packages/*'] → multi-patterns résolus", () => {
    createWorkspace("apps/frontend", "frontend");
    createWorkspace("packages/utils", "utils");
    writePkg(["apps/*", "packages/*"]);
    const result = detectWorkspaces(tmpDir);
    expect(result).toContain("apps/frontend");
    expect(result).toContain("packages/utils");
  });

  it("ignore les sous-dossiers sans package.json", () => {
    createWorkspace("packages/api", "@app/api");
    mkdirSync(join(tmpDir, "packages/.git"), { recursive: true }); // sans package.json
    writePkg(["packages/*"]);
    const result = detectWorkspaces(tmpDir);
    expect(result).toContain("packages/api");
    expect(result).not.toContain("packages/.git");
  });

  it("pattern glob avec répertoire inexistant → tableau vide", () => {
    writePkg(["nonexistent/*"]);
    const result = detectWorkspaces(tmpDir);
    expect(result).toHaveLength(0);
  });
});

describe("detectDomainDepth", () => {
  it("structure plate (src/auth/file.ts) → depth 1", () => {
    mkdirSync(join(tmpDir, "src", "auth"), { recursive: true });
    writeFileSync(join(tmpDir, "src", "auth", "auth.service.ts"), "");
    const result = detectDomainDepth(tmpDir, ["src"]);
    expect(result).toBe(1);
  });

  it("structure imbriquée (src/modules/accounts/file.ts) → depth 2", () => {
    mkdirSync(join(tmpDir, "src", "modules", "accounts"), { recursive: true });
    writeFileSync(join(tmpDir, "src", "modules", "accounts", "accounts.service.ts"), "");
    const result = detectDomainDepth(tmpDir, ["src"]);
    expect(result).toBe(2);
  });

  it("structure imbriquée dans server/src → depth 2", () => {
    mkdirSync(join(tmpDir, "server", "src", "modules", "users"), { recursive: true });
    writeFileSync(join(tmpDir, "server", "src", "modules", "users", "users.service.ts"), "");
    const result = detectDomainDepth(tmpDir, ["server/src"]);
    expect(result).toBe(2);
  });

  it("sourceRoots inexistants → depth 1", () => {
    const result = detectDomainDepth(tmpDir, ["nonexistent"]);
    expect(result).toBe(1);
  });

  it("sourceRoots vide → depth 1", () => {
    const result = detectDomainDepth(tmpDir, []);
    expect(result).toBe(1);
  });
});

describe("detectWorkspaces — fallback", () => {
  it("pas de package.json + dossier packages/ → fallback packages/", () => {
    createWorkspace("packages/lib", "lib");
    const result = detectWorkspaces(tmpDir);
    expect(result).toContain("packages/lib");
  });

  it("pas de workspaces déclarés + packages/ → fallback packages/", () => {
    createWorkspace("packages/core", "core");
    writeFileSync(join(tmpDir, "package.json"), JSON.stringify({ name: "root" }));
    const result = detectWorkspaces(tmpDir);
    expect(result).toContain("packages/core");
  });

  it("workspaces vide [] + pas de packages/ → tableau vide", () => {
    writeFileSync(join(tmpDir, "package.json"), JSON.stringify({ workspaces: [] }));
    const result = detectWorkspaces(tmpDir);
    expect(result).toHaveLength(0);
  });
});
