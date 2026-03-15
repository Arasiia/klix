#!/usr/bin/env bun

import { cmdIndex } from "./commands/index.cmd";
import { cmdInit } from "./commands/init.cmd";
import { cmdClaudeMd } from "./commands/claude-md.cmd";
import { cmdUpgrade } from "./commands/upgrade.cmd";

const VERSION = "0.1.4";

function printHelp() {
  console.log(`
klix v${VERSION} — CLI d'indexage codebase pour Claude

USAGE
  klix                               alias de \`klix index\`
  klix index                         génère .codeindex/*.md
  klix index --cwd /path/to/project  indexer un projet spécifique
  klix index --only routes,hooks     index sélectif
  klix init                          crée klix.config.json
  klix claude-md                     génère/met à jour CLAUDE.md
  klix upgrade                       met à jour klix vers la dernière version
  klix upgrade --check               vérifie sans mettre à jour
  klix --version
  klix --help

INDEXERS DISPONIBLES
  files, routes, functions, types, dbSchema, hooks
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--version") || args.includes("-v")) {
    console.log(`klix v${VERSION}`);
    process.exit(0);
  }

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const command = args[0] ?? "index";

  // Parse --cwd
  const cwdIdx = args.indexOf("--cwd");
  const cwd = cwdIdx !== -1 ? args[cwdIdx + 1] : process.cwd();

  if (!cwd) {
    console.error("[klix] --cwd requiert un chemin");
    process.exit(1);
  }

  // Parse --only
  const onlyIdx = args.indexOf("--only");
  const only = onlyIdx !== -1 ? args[onlyIdx + 1]?.split(",").map((s) => s.trim()) : undefined;

  switch (command) {
    case "index":
      await cmdIndex(cwd, only);
      break;
    case "init":
      await cmdInit(cwd);
      break;
    case "claude-md":
      await cmdClaudeMd(cwd);
      break;
    case "upgrade": {
      const checkOnly = args.includes("--check");
      await cmdUpgrade(VERSION, checkOnly);
      break;
    }
    default:
      // If first arg looks like a flag or path, treat as index
      if (command.startsWith("--") || command.startsWith("/") || command.startsWith(".")) {
        await cmdIndex(process.cwd(), only);
      } else {
        console.error(`[klix] Commande inconnue: ${command}`);
        printHelp();
        process.exit(1);
      }
  }
}

main().catch((err) => {
  console.error("[klix] Erreur fatale:", err.message);
  process.exit(1);
});
