import { readFileSync } from "fs";
import { relative, basename } from "path";
import { globFiles } from "../lib/walker";
import type { KlixConfig } from "../lib/config";
import { findHooksAdapter } from "../adapters";
import { tanstackQueryAdapter } from "../adapters/hooks/tanstack-query.adapter";
import type { HookEntry, HooksAdapter } from "../adapters";
import { extractDomain } from "../lib/domain-splitter";

export type { HookEntry };

/** @deprecated Utiliser tanstackQueryAdapter.classifyHook() depuis src/adapters/hooks/tanstack-query.adapter.ts */
export function classifyHook(content: string, fnName: string): HookEntry["kind"] {
  return tanstackQueryAdapter.classifyHook(content, fnName);
}

/** @deprecated Utiliser tanstackQueryAdapter.extractQueryKey() */
export function extractQueryKey(content: string, fnName: string): string | undefined {
  return tanstackQueryAdapter.extractQueryKey?.(content, fnName);
}

/** @deprecated Utiliser tanstackQueryAdapter.extractMutationFn() */
export function extractMutationFn(content: string, fnName: string): string | undefined {
  return tanstackQueryAdapter.extractMutationFn?.(content, fnName);
}

function extractQueryKeys(content: string, file: string): HookEntry[] {
  const results: HookEntry[] = [];
  const pattern = /export\s+const\s+(\w+Keys)\s*=\s*\{/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    results.push({ name: match[1], kind: "queryKey", file });
  }
  return results;
}

function extractHookFunctions(content: string, file: string, adapter: HooksAdapter): HookEntry[] {
  const results: HookEntry[] = [];

  const pattern = /export\s+(?:function|const)\s+(use\w+)/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const name = match[1];
    const kind = adapter.classifyHook(content, name);
    const queryKey = kind === "query" ? adapter.extractQueryKey?.(content, name) : undefined;
    const mutationFn = kind === "mutation" ? adapter.extractMutationFn?.(content, name) : undefined;
    results.push({ name, kind, queryKey, mutationFn, file });
  }

  return results;
}

/** Helper interne : collecte tous les hooks */
function collectHooks(
  rootDir: string,
  config: KlixConfig,
): { allHooks: HookEntry[]; allQueryKeys: HookEntry[] } | null {
  const { filePattern, framework } = config.indexers.hooks;
  const adapter = findHooksAdapter(framework);
  if (!adapter) return null;

  const files = globFiles(rootDir, filePattern, config.exclude);
  const allHooks: HookEntry[] = [];
  const allQueryKeys: HookEntry[] = [];

  for (const filePath of files) {
    let content = "";
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const file = relative(process.cwd(), filePath).replace(/\\/g, "/");
    allQueryKeys.push(...extractQueryKeys(content, file));
    allHooks.push(...extractHookFunctions(content, file, adapter));
  }

  return { allHooks, allQueryKeys };
}

/** Retourne les hooks groupés par domaine (premier segment significatif du chemin) */
export function runHooksIndexerGrouped(rootDir: string, config: KlixConfig): Map<string, HookEntry[]> {
  const result = collectHooks(rootDir, config);
  if (!result) return new Map();

  const { allHooks, allQueryKeys } = result;
  const byDomain = new Map<string, HookEntry[]>();

  for (const entry of [...allQueryKeys, ...allHooks]) {
    const domain = extractDomain(entry.file, config.domainDepth ?? 1);
    if (!byDomain.has(domain)) byDomain.set(domain, []);
    byDomain.get(domain)!.push(entry);
  }

  return byDomain;
}

/** Sérialise les hooks d'un domaine pour un fichier de split */
export function serializeHooksSection(domain: string, entries: HookEntry[], config: KlixConfig): string {
  const { framework } = config.indexers.hooks;
  const queryKeys = entries.filter((e) => e.kind === "queryKey");
  const hooks = entries.filter((e) => e.kind !== "queryKey");

  const byFile = new Map<string, HookEntry[]>();
  for (const hook of hooks) {
    if (!byFile.has(hook.file)) byFile.set(hook.file, []);
    byFile.get(hook.file)!.push(hook);
  }

  const lines: string[] = [
    `# HOOKS/${domain} — ${config.name}`,
    ``,
    `> ${hooks.length} hooks · domaine: ${domain} · framework: ${framework}`,
    ``,
  ];

  if (queryKeys.length) {
    lines.push(`## Query Keys`);
    for (const qk of queryKeys) {
      lines.push(`- **\`${qk.name}\`** — \`${qk.file}\``);
    }
    lines.push(``);
  }

  lines.push(`## Hooks par fichier`);
  lines.push(``);

  for (const [file, fileHooks] of byFile) {
    const filename = basename(file);
    lines.push(`### \`${filename}\``);
    lines.push(`> \`${file}\``);
    lines.push(``);

    const queries = fileHooks.filter((h) => h.kind === "query");
    const mutations = fileHooks.filter((h) => h.kind === "mutation");
    const others = fileHooks.filter((h) => h.kind === "other");

    if (queries.length) {
      lines.push(`**Queries** (${queries.length})`);
      for (const h of queries) {
        const key = h.queryKey ? ` · key: \`${h.queryKey}\`` : "";
        lines.push(`- \`${h.name}()\`${key}`);
      }
    }

    if (mutations.length) {
      lines.push(`**Mutations** (${mutations.length})`);
      for (const h of mutations) {
        const fn = h.mutationFn ? ` · fn: \`${h.mutationFn}\`` : "";
        lines.push(`- \`${h.name}()\`${fn}`);
      }
    }

    if (others.length) {
      lines.push(`**Autres**`);
      for (const h of others) lines.push(`- \`${h.name}()\``);
    }

    lines.push(``);
  }

  return lines.join("\n");
}

export function runHooksIndexer(rootDir: string, config: KlixConfig): string {
  const { framework } = config.indexers.hooks;
  const adapter = findHooksAdapter(framework);

  if (!adapter) {
    console.warn(`[klix] hooks: framework inconnu "${framework}". Adaptateurs disponibles : tanstack-query`);
    return `# HOOKS — ${config.name}\n\n> framework "${framework}" non supporté.\n`;
  }

  const result = collectHooks(rootDir, config);
  const allHooks = result?.allHooks ?? [];
  const allQueryKeys = result?.allQueryKeys ?? [];

  // Group hooks by file
  const byFile = new Map<string, HookEntry[]>();
  for (const hook of allHooks) {
    if (!byFile.has(hook.file)) byFile.set(hook.file, []);
    byFile.get(hook.file)!.push(hook);
  }

  const lines: string[] = [`# HOOKS — ${config.name}`, ``, `> ${allHooks.length} hooks · framework: ${framework}`, ``];

  if (allQueryKeys.length) {
    lines.push(`## Query Keys`);
    for (const qk of allQueryKeys) {
      lines.push(`- **\`${qk.name}\`** — \`${qk.file}\``);
    }
    lines.push(``);
  }

  lines.push(`## Hooks par fichier`);
  lines.push(``);

  for (const [file, hooks] of byFile) {
    const filename = basename(file);
    lines.push(`### \`${filename}\``);
    lines.push(`> \`${file}\``);
    lines.push(``);

    const queries = hooks.filter((h) => h.kind === "query");
    const mutations = hooks.filter((h) => h.kind === "mutation");
    const others = hooks.filter((h) => h.kind === "other");

    if (queries.length) {
      lines.push(`**Queries** (${queries.length})`);
      for (const h of queries) {
        const key = h.queryKey ? ` · key: \`${h.queryKey}\`` : "";
        lines.push(`- \`${h.name}()\`${key}`);
      }
    }

    if (mutations.length) {
      lines.push(`**Mutations** (${mutations.length})`);
      for (const h of mutations) {
        const fn = h.mutationFn ? ` · fn: \`${h.mutationFn}\`` : "";
        lines.push(`- \`${h.name}()\`${fn}`);
      }
    }

    if (others.length) {
      lines.push(`**Autres**`);
      for (const h of others) lines.push(`- \`${h.name}()\``);
    }

    lines.push(``);
  }

  return lines.join("\n");
}
