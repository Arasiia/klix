const SKIP_SEGMENTS = new Set(["src", "app", "lib", "utils"]);

/**
 * Extrait le premier segment significatif d'un chemin de fichier comme "domaine".
 * Ignore les préfixes courants (src/, server/src/, etc.) et les segments génériques.
 *
 * @example
 * extractDomain("src/auth/user.service.ts") → "auth"
 * extractDomain("server/src/db/schema/user.ts") → "db"
 * extractDomain("src/index.ts") → "root"
 */
export function extractDomain(filePath: string): string {
  const normalized = filePath.replace(/^\.\//, "").replace(/\\/g, "/");

  // Ordre important : les plus spécifiques en premier
  const prefixes = ["server/src/", "client/src/", "src/", "server/", "client/", "app/", "lib/", "utils/"];
  let path = normalized;
  for (const p of prefixes) {
    if (path.startsWith(p)) {
      path = path.slice(p.length);
      break;
    }
  }

  const firstSegment = path.split("/")[0] ?? "";
  const segment = firstSegment.replace(/\.[^.]+$/, "");

  // Pas de sous-dossier, segment générique ou vide → root
  if (!segment || SKIP_SEGMENTS.has(segment) || !path.includes("/")) return "root";
  return segment;
}

/**
 * Détermine si un contenu devrait être découpé en fichiers par domaine.
 */
export function shouldSplit(content: string, threshold: number): boolean {
  return content.split("\n").length > threshold;
}
