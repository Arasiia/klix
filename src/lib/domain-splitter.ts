const SKIP_SEGMENTS = new Set(["src", "app", "lib", "utils"]);

const KNOWN_SUFFIXES = [
  ".api", ".service", ".routes", ".route", ".hook", ".hooks",
  ".store", ".types", ".type", ".controller", ".model",
  ".repository", ".handler", ".util", ".utils", ".helper",
  ".middleware", ".guard", ".interceptor", ".adapter", ".plugin",
];

/**
 * Extrait les segments significatifs d'un chemin de fichier comme "domaine".
 * Ignore les préfixes courants (src/, server/src/, etc.) et les segments génériques.
 *
 * @param depth Nombre de segments à collecter (défaut 1 = comportement historique)
 *
 * @example depth=1 (défaut)
 * extractDomain("src/auth/user.service.ts") → "auth"
 * extractDomain("server/src/db/schema/user.ts") → "db"
 * extractDomain("src/index.ts") → "root"
 *
 * @example depth=2
 * extractDomain("src/modules/accounts/accounts.service.ts", 2) → "modules.accounts"
 * extractDomain("src/api/accounts.api.ts", 2) → "api.accounts"
 * extractDomain("src/auth/auth.service.ts", 2) → "auth"  (dédup)
 */
export function extractDomain(filePath: string, depth: number = 1): string {
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

  // Fichier à la racine (pas de sous-dossier après stripping du préfixe)
  if (!path.includes("/")) return "root";

  // depth=1 : comportement original exact (compatibilité totale)
  if (depth <= 1) {
    const segment = path.split("/")[0].replace(/\.[^.]+$/, "");
    if (!segment || SKIP_SEGMENTS.has(segment)) return "root";
    return segment;
  }

  // depth >= 2 : extraction multi-niveau
  const rawSegments = path.split("/");
  const collected: string[] = [];

  for (let i = 0; i < rawSegments.length && collected.length < depth; i++) {
    const raw = rawSegments[i];
    const isLast = i === rawSegments.length - 1;

    let segment: string;
    if (isLast) {
      // Fichier : strip extension puis suffixes connus
      let name = raw.replace(/\.[^.]+$/, "");
      for (const suffix of KNOWN_SUFFIXES) {
        if (name.endsWith(suffix)) {
          name = name.slice(0, -suffix.length);
          break;
        }
      }
      segment = name;
    } else {
      segment = raw;
    }

    if (!segment || SKIP_SEGMENTS.has(segment)) continue;
    collected.push(segment);
  }

  if (collected.length === 0) return "root";

  // Dédupliquer les segments consécutifs identiques (ex: auth/auth.service → "auth")
  const deduped: string[] = [];
  for (const seg of collected) {
    if (deduped.length === 0 || deduped[deduped.length - 1] !== seg) {
      deduped.push(seg);
    }
  }

  return deduped.join(".") || "root";
}

/**
 * Détermine si un contenu devrait être découpé en fichiers par domaine.
 */
export function shouldSplit(content: string, threshold: number): boolean {
  return content.split("\n").length > threshold;
}
