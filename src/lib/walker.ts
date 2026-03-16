import { readdirSync, statSync } from "fs";
import { join, relative } from "path";

function expandBraces(pattern: string): string[] {
  const match = pattern.match(/^(.*?)\{([^}]+)\}(.*)$/);
  if (!match) return [pattern];
  const [, prefix, alternatives, suffix] = match;
  return alternatives.split(",").flatMap((alt) => expandBraces(prefix + alt + suffix));
}

function matchGlobSingle(pattern: string, filePath: string): boolean {
  // Convert glob to regex
  const escaped = pattern
    .replace(/[.+^$()|[\]\\]/g, "\\$&")
    .replace(/\?/g, "[^/]") // Glob ? → avant d'introduire des ? de quantificateur
    .replace(/\*\*\//g, "(.+/)?") // **/ → groupe optionnel
    .replace(/\*\*/g, ".+") // ** → n'importe quoi
    .replace(/\*/g, "[^/]+"); // * → segment sans /
  const regex = new RegExp(`^${escaped}$`);
  return regex.test(filePath) || regex.test(filePath.replace(/^\.\//, ""));
}

function matchGlob(pattern: string, filePath: string): boolean {
  const expanded = expandBraces(pattern);
  return expanded.some((p) => matchGlobSingle(p, filePath));
}

export function matchesAnyPattern(filePath: string, patterns: string[]): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return patterns.some((p) => matchGlob(p, normalized));
}

export function walkFiles(rootDir: string, include: string[], exclude: string[]): string[] {
  const results: string[] = [];

  function walk(dir: string) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const relPath = relative(rootDir, fullPath).replace(/\\/g, "/");

      // Check exclusion
      if (matchesAnyPattern(relPath, exclude)) continue;

      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        // Check if directory itself is excluded
        const dirPath = relPath + "/";
        if (exclude.some((p) => matchGlob(p, dirPath + "dummy") || matchGlob(p, relPath))) continue;
        walk(fullPath);
      } else if (stat.isFile()) {
        if (matchesAnyPattern(relPath, include)) {
          results.push(fullPath);
        }
      }
    }
  }

  walk(rootDir);
  return results.sort();
}

export function globFiles(rootDir: string, pattern: string, exclude: string[] = []): string[] {
  return walkFiles(rootDir, [pattern], exclude);
}
