import { renameSync, chmodSync, writeFileSync, unlinkSync } from "fs";
import { join, dirname } from "path";

const REPO = "Arasiia/klix";

type Platform = "klix-macos-arm64" | "klix-macos-x64" | "klix-linux-x64";

function detectPlatform(): Platform {
  const { platform, arch } = process;

  if (platform === "darwin" && arch === "arm64") return "klix-macos-arm64";
  if (platform === "darwin" && arch === "x64") return "klix-macos-x64";
  if (platform === "linux" && arch === "x64") return "klix-linux-x64";

  console.error(`[klix] Plateforme non supportée: ${platform} ${arch}`);
  process.exit(1);
}

export function isNewer(current: string, remote: string): boolean {
  const cur = current.replace(/^v/, "").split(".").map(Number);
  const rem = remote.replace(/^v/, "").split(".").map(Number);
  const len = Math.max(cur.length, rem.length);

  for (let i = 0; i < len; i++) {
    const c = cur[i] ?? 0;
    const r = rem[i] ?? 0;
    if (r > c) return true;
    if (r < c) return false;
  }
  return false;
}

interface GitHubRelease {
  tag_name: string;
  assets: Array<{ name: string; browser_download_url: string }>;
}

async function fetchLatestRelease(repo: string): Promise<GitHubRelease> {
  const url = `https://api.github.com/repos/${repo}/releases/latest`;
  let res: Response;

  try {
    res = await fetch(url, {
      headers: { "User-Agent": "klix-upgrade" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[klix] Impossible de contacter GitHub: ${msg}`);
    process.exit(1);
  }

  if (!res.ok) {
    console.error(`[klix] Erreur API GitHub: ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  return res.json() as Promise<GitHubRelease>;
}

function resolveExecPath(): string {
  const execPath = process.execPath;

  if (execPath.includes("bun") && !execPath.includes("klix")) {
    console.error(
      "[klix] Mode développement détecté — upgrade uniquement disponible pour les binaires compilés."
    );
    console.error(
      "[klix] Pour tester: bun build src/index.ts --compile --outfile /tmp/klix-test && /tmp/klix-test upgrade --check"
    );
    process.exit(1);
  }

  return execPath;
}

async function downloadBinary(url: string, destPath: string): Promise<void> {
  let res: Response;

  try {
    res = await fetch(url, { headers: { "User-Agent": "klix-upgrade" } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[klix] Erreur de téléchargement: ${msg}`);
    process.exit(1);
  }

  if (!res.ok) {
    console.error(`[klix] Téléchargement échoué: ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  const contentLength = res.headers.get("content-length");
  const total = contentLength ? parseInt(contentLength, 10) : 0;

  const body = res.body;
  if (!body) {
    console.error("[klix] Réponse vide du serveur");
    process.exit(1);
  }

  const chunks: Uint8Array[] = [];
  let received = 0;

  const reader = body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;

    if (total > 0) {
      const pct = Math.round((received / total) * 100);
      process.stdout.write(`\r  Téléchargement... ${pct}% (${Math.round(received / 1024)} Ko)`);
    } else {
      process.stdout.write(`\r  Téléchargement... ${Math.round(received / 1024)} Ko`);
    }
  }
  process.stdout.write("\n");

  const buffer = Buffer.concat(chunks);

  try {
    writeFileSync(destPath, buffer);
    chmodSync(destPath, 0o755);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("EACCES") || msg.includes("permission")) {
      console.error("[klix] Permission refusée. Relancer avec: sudo klix upgrade");
    } else {
      console.error(`[klix] Erreur d'écriture: ${msg}`);
    }
    process.exit(1);
  }
}

export async function cmdUpgrade(currentVersion: string, checkOnly = false): Promise<void> {
  const execPath = resolveExecPath();
  const asset = detectPlatform();

  console.log(`[klix] Version actuelle : v${currentVersion}`);
  console.log(`[klix] Plateforme détectée : ${asset}`);
  console.log("[klix] Vérification des mises à jour...");

  const release = await fetchLatestRelease(REPO);
  const remoteVersion = release.tag_name.replace(/^v/, "");

  console.log(`[klix] Dernière version disponible : v${remoteVersion}`);

  if (!isNewer(currentVersion, remoteVersion)) {
    console.log(`[klix] Déjà à jour (v${currentVersion})`);
    return;
  }

  if (checkOnly) {
    console.log(`[klix] Mise à jour disponible : v${currentVersion} → v${remoteVersion}`);
    console.log("[klix] Lancer \`klix upgrade\` pour installer.");
    return;
  }

  const assetInfo = release.assets.find((a) => a.name === asset);
  if (!assetInfo) {
    console.error(
      `[klix] Asset introuvable pour la plateforme "${asset}" dans la release v${remoteVersion}.`
    );
    console.error("[klix] Assets disponibles:", release.assets.map((a) => a.name).join(", "));
    process.exit(1);
  }

  const tmpPath = join(dirname(execPath), `klix-upgrade-tmp-${process.pid}`);

  console.log(`[klix] Téléchargement de v${remoteVersion}...`);
  await downloadBinary(assetInfo.browser_download_url, tmpPath);

  try {
    renameSync(tmpPath, execPath);
  } catch (err: unknown) {
    // Cleanup tmp on failure
    try { unlinkSync(tmpPath); } catch {}
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("EACCES") || msg.includes("permission")) {
      console.error("[klix] Permission refusée. Relancer avec: sudo klix upgrade");
    } else {
      console.error(`[klix] Erreur lors du remplacement du binaire: ${msg}`);
    }
    process.exit(1);
  }

  console.log(`[klix] klix mis à jour vers v${remoteVersion} avec succès !`);
}
