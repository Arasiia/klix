import { describe, it, expect } from "bun:test";
import { isNewer } from "../../src/commands/upgrade.cmd";

describe("isNewer", () => {
  it("retourne true si la version distante est plus récente (patch)", () => {
    expect(isNewer("0.1.0", "0.1.1")).toBe(true);
  });

  it("retourne true si la version distante est plus récente (minor)", () => {
    expect(isNewer("0.1.0", "0.2.0")).toBe(true);
  });

  it("retourne true si la version distante est plus récente (major)", () => {
    expect(isNewer("0.9.9", "1.0.0")).toBe(true);
  });

  it("retourne false si les versions sont identiques", () => {
    expect(isNewer("0.1.0", "0.1.0")).toBe(false);
  });

  it("retourne false si la version actuelle est plus récente", () => {
    expect(isNewer("1.0.0", "0.9.9")).toBe(false);
  });

  it("accepte les versions avec préfixe v", () => {
    expect(isNewer("v0.1.0", "v0.1.1")).toBe(true);
    expect(isNewer("v0.1.0", "v0.1.0")).toBe(false);
  });

  it("gère les segments manquants (ex: 0.1 vs 0.1.1)", () => {
    expect(isNewer("0.1", "0.1.1")).toBe(true);
    expect(isNewer("0.1.1", "0.1")).toBe(false);
  });
});
