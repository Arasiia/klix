import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { ensureDir, writeIndex, updateClaudeMd } from "../../src/lib/writer";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "klix-writer-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("ensureDir", () => {
  it("crée un dossier simple", () => {
    const dir = join(tmpDir, "output");
    ensureDir(dir);
    expect(existsSync(dir)).toBe(true);
  });

  it("crée des dossiers imbriqués récursivement", () => {
    const dir = join(tmpDir, "a", "b", "c");
    ensureDir(dir);
    expect(existsSync(dir)).toBe(true);
  });

  it("ne plante pas si le dossier existe déjà", () => {
    const dir = join(tmpDir, "existing");
    ensureDir(dir);
    ensureDir(dir); // deuxième appel
    expect(existsSync(dir)).toBe(true);
  });
});

describe("writeIndex", () => {
  it("écrit le contenu dans le fichier", () => {
    const content = "# Mon index\n\nContenu test";
    const path = writeIndex(tmpDir, "TEST.md", content);
    expect(readFileSync(path, "utf-8")).toBe(content);
  });

  it("retourne le chemin complet du fichier", () => {
    const path = writeIndex(tmpDir, "FILES.md", "contenu");
    expect(path).toBe(join(tmpDir, "FILES.md"));
  });

  it("crée le dossier output s'il n'existe pas", () => {
    const outputDir = join(tmpDir, "nouveau-dossier");
    writeIndex(outputDir, "INDEX.md", "# Index");
    expect(existsSync(join(outputDir, "INDEX.md"))).toBe(true);
  });

  it("écrase le fichier existant", () => {
    writeIndex(tmpDir, "FILE.md", "ancien contenu");
    writeIndex(tmpDir, "FILE.md", "nouveau contenu");
    const content = readFileSync(join(tmpDir, "FILE.md"), "utf-8");
    expect(content).toBe("nouveau contenu");
  });
});

describe("updateClaudeMd", () => {
  const claudeMdPath = () => join(tmpDir, "CLAUDE.md");

  it("crée le fichier s'il n'existe pas", () => {
    updateClaudeMd(claudeMdPath(), "## Section klix\n\nContenu");
    expect(existsSync(claudeMdPath())).toBe(true);
    const content = readFileSync(claudeMdPath(), "utf-8");
    expect(content).toContain("<!-- klix:start -->");
    expect(content).toContain("<!-- klix:end -->");
    expect(content).toContain("## Section klix");
  });

  it("remplace le bloc existant entre les marqueurs", () => {
    const initial = `# Mon projet\n\n<!-- klix:start -->\nancien contenu\n<!-- klix:end -->\n\nSuite`;
    writeIndex(tmpDir, "CLAUDE.md", initial);

    updateClaudeMd(claudeMdPath(), "nouveau contenu");
    const content = readFileSync(claudeMdPath(), "utf-8");
    expect(content).toContain("nouveau contenu");
    expect(content).not.toContain("ancien contenu");
    expect(content).toContain("Suite"); // le reste est préservé
  });

  it("préfixe le bloc si pas de marqueurs dans le fichier existant", () => {
    writeIndex(tmpDir, "CLAUDE.md", "# Contenu existant\n\nSuite");
    updateClaudeMd(claudeMdPath(), "section klix");
    const content = readFileSync(claudeMdPath(), "utf-8");
    expect(content.indexOf("<!-- klix:start -->")).toBeLessThan(content.indexOf("# Contenu existant"));
    expect(content).toContain("# Contenu existant");
  });

  it("ne crée qu'un seul bloc même si appelé plusieurs fois", () => {
    updateClaudeMd(claudeMdPath(), "version 1");
    updateClaudeMd(claudeMdPath(), "version 2");
    const content = readFileSync(claudeMdPath(), "utf-8");
    const count = (content.match(/<!-- klix:start -->/g) ?? []).length;
    expect(count).toBe(1);
    expect(content).toContain("version 2");
    expect(content).not.toContain("version 1");
  });
});
