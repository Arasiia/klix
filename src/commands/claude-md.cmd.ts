import { join } from "path";
import { loadConfig } from "../lib/config";
import { updateClaudeMd } from "../lib/writer";
import { buildStackMarkdown } from "../lib/stack-detector";

const INDEX_SECTION = `## AI Index (klix)

Avant toute tâche, lire \`.codeindex/INDEX.md\`.
Puis selon le besoin, 1-2 fichiers d'index spécifiques.

| Besoin | Index à lire |
|--------|-------------|
| Fichiers / structure | \`.codeindex/FILES.md\` |
| Endpoints API | \`.codeindex/API_ROUTES.md\` |
| Fonctions, signatures, JSDoc | \`.codeindex/FUNCTIONS.md\` |
| Types, interfaces, enums | \`.codeindex/TYPES.md\` |
| Tables DB, colonnes, FK | \`.codeindex/DB_SCHEMA.md\` |
| Hooks React Query | \`.codeindex/HOOKS.md\` |

Régénérer : \`klix index\``;

function buildMonorepoIndexSection(workspaces: string[]): string {
  return [
    `## AI Index (klix — monorepo)`,
    ``,
    `Monorepo. Lire l'index du workspace concerné avant toute tâche.`,
    ``,
    `| Workspace | Index |`,
    `|-----------|-------|`,
    ...workspaces.map((ws) => `| \`${ws}\` | \`${ws}/.codeindex/INDEX.md\` |`),
    ``,
    `Régénérer : \`klix index\``,
  ].join("\n");
}

export async function cmdClaudeMd(cwd: string) {
  const config = loadConfig(cwd);
  const claudeMdPath = join(cwd, config.claude.claudeMdPath);

  const stackMarkdown = buildStackMarkdown(cwd);
  const conventionsMarkdown = buildConventionsMarkdown(config.claude.conventions);

  const indexSection =
    config.workspaces && config.workspaces.length > 0
      ? buildMonorepoIndexSection(config.workspaces)
      : INDEX_SECTION;

  const parts = [indexSection];
  if (stackMarkdown) parts.push(stackMarkdown);
  if (conventionsMarkdown) parts.push(conventionsMarkdown);

  const section = parts.join("\n\n");

  updateClaudeMd(claudeMdPath, section);

  console.log(`[klix] CLAUDE.md mis à jour : ${claudeMdPath}`);
  if (stackMarkdown) {
    console.log(`  Stack technique détectée et ajoutée.`);
  }
}

function buildConventionsMarkdown(conventions: string[]): string {
  if (!conventions.length) return "";
  const lines = [`## Conventions`, ``];
  for (const c of conventions) lines.push(`- ${c}`);
  return lines.join("\n");
}
