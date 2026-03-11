import { join } from "path";
import { loadConfig, type KlixConfig } from "../lib/config";
import { writeIndex, writeIndexDir } from "../lib/writer";
import { shouldSplit } from "../lib/domain-splitter";
import { runFilesIndexer, runFilesIndexerGrouped, serializeFilesSection } from "../indexers/files.indexer";
import { runRoutesIndexer, runRoutesIndexerGrouped, serializeRoutesSection } from "../indexers/routes.indexer";
import {
  runFunctionsIndexer,
  runFunctionsIndexerGrouped,
  serializeFunctionsSection,
} from "../indexers/functions.indexer";
import { runTypesIndexer, runTypesIndexerGrouped, serializeTypesSection } from "../indexers/types.indexer";
import { runDbSchemaIndexer, runDbSchemaIndexerGrouped, serializeDbSchemaSection } from "../indexers/db-schema.indexer";
import { runHooksIndexer, runHooksIndexerGrouped, serializeHooksSection } from "../indexers/hooks.indexer";

const INDEXER_MAP = {
  files: runFilesIndexer,
  routes: runRoutesIndexer,
  functions: runFunctionsIndexer,
  types: runTypesIndexer,
  dbSchema: runDbSchemaIndexer,
  hooks: runHooksIndexer,
} as const;

const INDEXER_FILENAMES: Record<string, string> = {
  files: "FILES.md",
  routes: "API_ROUTES.md",
  functions: "FUNCTIONS.md",
  types: "TYPES.md",
  dbSchema: "DB_SCHEMA.md",
  hooks: "HOOKS.md",
};

const INDEXER_DIRS: Record<string, string> = {
  files: "FILES",
  routes: "API_ROUTES",
  functions: "FUNCTIONS",
  types: "TYPES",
  dbSchema: "DB_SCHEMA",
  hooks: "HOOKS",
};

const GROUPED_RUNNER_MAP: Record<string, (rootDir: string, config: KlixConfig) => Map<string, any>> = {
  files: runFilesIndexerGrouped,
  routes: runRoutesIndexerGrouped,
  functions: runFunctionsIndexerGrouped,
  types: runTypesIndexerGrouped,
  dbSchema: runDbSchemaIndexerGrouped,
  hooks: runHooksIndexerGrouped,
};

const SERIALIZE_MAP: Record<string, (domain: string, data: any, config: KlixConfig) => string> = {
  files: serializeFilesSection,
  routes: serializeRoutesSection,
  functions: serializeFunctionsSection,
  types: serializeTypesSection,
  dbSchema: serializeDbSchemaSection,
  hooks: serializeHooksSection,
};

type IndexerKey = keyof typeof INDEXER_MAP;

interface GeneratedEntry {
  filename: string;
  lineCount: number;
  splitDomains?: string[];
  subDir?: string;
}

/** Fusionne les données de plusieurs domaines en un seul groupe (_others) */
function mergeGroupedData(items: [string, any][]): any {
  if (items.length === 0) return [];
  const firstData = items[0][1];
  if (Array.isArray(firstData)) {
    return items.flatMap(([, d]) => d as any[]);
  }
  // db-schema style : { tables, enums }
  return {
    tables: items.flatMap(([, d]) => (d as any).tables ?? []),
    enums: items.flatMap(([, d]) => (d as any).enums ?? []),
  };
}

function generateSplitSummary(
  filename: string,
  subDir: string,
  domainInfos: [string, number][],
  totalLineCount: number,
  threshold: number,
  config: any,
): string {
  const titleName = filename.replace(".md", "");
  const lines = [
    `# ${titleName} — ${config.name}`,
    ``,
    `> ${totalLineCount} lignes · découpé en ${domainInfos.length} domaines (seuil : ${threshold} lignes)`,
    ``,
    `## Domaines`,
    ``,
    `| Domaine | Fichier | Lignes |`,
    `|---------|---------|--------|`,
  ];

  for (const [domain, lineCount] of domainInfos) {
    lines.push(`| ${domain} | \`.codeindex/${subDir}/${domain}.md\` | ${lineCount} |`);
  }

  lines.push(``);
  lines.push(`> Lire directement le fichier du domaine concerné. Régénérer : \`klix index\``);
  return lines.join("\n");
}

function generateMasterIndex(config: any, generated: GeneratedEntry[]): string {
  const lines = [
    `# INDEX — ${config.name}`,
    ``,
    `> Généré par klix. Lire ce fichier en premier, puis 1-2 index spécifiques selon le besoin.`,
    ``,
    `## Index disponibles`,
    ``,
    `| Besoin | Fichier | Domaines |`,
    `|--------|---------|----------|`,
  ];

  const descriptions: Record<string, string> = {
    "FILES.md": "Structure fichiers, rôles, exports",
    "API_ROUTES.md": "Endpoints HTTP, méthodes, body",
    "FUNCTIONS.md": "Fonctions exportées, signatures, JSDoc",
    "TYPES.md": "Interfaces, types, enums",
    "DB_SCHEMA.md": "Tables, colonnes, clés étrangères",
    "HOOKS.md": "Hooks React Query (useQuery, useMutation)",
  };

  for (const entry of generated) {
    const desc = descriptions[entry.filename] ?? entry.filename;
    if (entry.splitDomains && entry.splitDomains.length > 0) {
      const domainList = entry.splitDomains.join(", ");
      lines.push(`| ${desc} | \`.codeindex/${entry.filename}\` | ${domainList} |`);
    } else {
      lines.push(`| ${desc} | \`.codeindex/${entry.filename}\` | — |`);
    }
  }

  lines.push(``);
  lines.push(`## Workflow par tâche`);
  lines.push(``);
  lines.push(`| Tâche | Index à lire |`);
  lines.push(`|-------|-------------|`);
  lines.push(`| Nouvelle feature | DB_SCHEMA.md + API_ROUTES.md + FUNCTIONS.md |`);
  lines.push(`| Bugfix API | API_ROUTES.md → 1 fichier ciblé |`);
  lines.push(`| Composant React | HOOKS.md + TYPES.md |`);
  lines.push(`| Migration DB | DB_SCHEMA.md |`);
  lines.push(`| Explorer la base | FILES.md |`);
  lines.push(``);
  lines.push(`> Régénérer : \`klix index\``);

  return lines.join("\n");
}

export async function cmdIndex(cwd: string, only?: string[]) {
  console.log(`[klix] Indexation de ${cwd}...`);

  const config = loadConfig(cwd);

  // Monorepo : dispatcher sur chaque workspace
  if (config.workspaces && config.workspaces.length > 0) {
    console.log(`[klix] Monorepo détecté — ${config.workspaces.length} workspace(s)`);
    for (const ws of config.workspaces) {
      const wsCwd = join(cwd, ws);
      console.log(`\n[klix] ▶ ${ws}`);
      await cmdIndex(wsCwd, only);
    }
    console.log(`\n[klix] Tous les workspaces indexés.`);
    return;
  }
  const outputDir = join(cwd, config.output);
  const generated: GeneratedEntry[] = [];
  const threshold = config.splitThreshold ?? 150;
  const maxSections = config.maxSections ?? 20;

  const indexersToRun = only?.length
    ? (only as IndexerKey[]).filter((k) => k in INDEXER_MAP)
    : (Object.keys(INDEXER_MAP) as IndexerKey[]);

  for (const key of indexersToRun) {
    const indexerConfig = config.indexers[key as keyof typeof config.indexers];
    if (typeof indexerConfig === "object" && "enabled" in indexerConfig && !indexerConfig.enabled) {
      console.log(`  ⏭  ${key} (désactivé)`);
      continue;
    }

    const runner = INDEXER_MAP[key];
    const filename = INDEXER_FILENAMES[key];

    try {
      process.stdout.write(`  ⚙  ${key}...`);
      const flatContent = runner(cwd, config);
      const lineCount = flatContent.split("\n").length;

      if (shouldSplit(flatContent, threshold)) {
        const groupedRunner = GROUPED_RUNNER_MAP[key];
        const byDomain = groupedRunner(cwd, config);
        const domains = [...byDomain.entries()];
        const subDir = INDEXER_DIRS[key];

        // Regrouper dans _others si trop de domaines
        let finalDomains: [string, any][];
        if (domains.length > maxSections) {
          const main = domains.slice(0, maxSections - 1);
          const rest = domains.slice(maxSections - 1);
          finalDomains = [...main, ["_others", mergeGroupedData(rest)]];
        } else {
          finalDomains = domains;
        }

        const serialize = SERIALIZE_MAP[key];
        const domainInfos: [string, number][] = [];

        for (const [domain, data] of finalDomains) {
          const sectionContent = serialize(domain, data, config);
          const sectionLineCount = sectionContent.split("\n").length;
          writeIndexDir(outputDir, subDir, `${domain}.md`, sectionContent);
          domainInfos.push([domain, sectionLineCount]);
        }

        const summary = generateSplitSummary(filename, subDir, domainInfos, lineCount, threshold, config);
        writeIndex(outputDir, filename, summary);

        const splitDomains = finalDomains.map(([d]) => d);
        generated.push({ filename, lineCount, splitDomains, subDir });
        console.log(` ✓ (${lineCount} lignes → ${splitDomains.length} domaines)`);
      } else {
        writeIndex(outputDir, filename, flatContent);
        generated.push({ filename, lineCount });
        console.log(` ✓ (${lineCount} lignes → ${filename})`);
      }
    } catch (err: any) {
      console.log(` ✗ erreur: ${err.message}`);
    }
  }

  // Generate master INDEX.md
  const masterContent = generateMasterIndex(config, generated);
  writeIndex(outputDir, "INDEX.md", masterContent);
  console.log(`  ✓ INDEX.md généré`);

  console.log(`\n[klix] ${generated.length + 1} fichiers dans ${config.output}/`);
}
