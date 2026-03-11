import type { HooksAdapter, HookEntry } from "./_base";

function findFunctionBody(content: string, fnName: string): string {
  const pattern = new RegExp(`export\\s+(?:function|const)\\s+${fnName}\\b`);
  const m = pattern.exec(content);
  if (!m) return "";
  return content.slice(m.index, m.index + 600);
}

export const tanstackQueryAdapter: HooksAdapter = {
  id: "tanstack-query",
  name: "TanStack Query",
  packages: ["@tanstack/react-query"],
  defaultFilePattern: "**/hooks/use-*.ts",

  classifyHook(content: string, fnName: string): HookEntry["kind"] {
    const slice = findFunctionBody(content, fnName);
    if (!slice) return "other";

    if (/useQuery\s*\(|useSuspenseQuery\s*\(/.test(slice)) return "query";
    if (/useMutation\s*\(/.test(slice)) return "mutation";
    return "other";
  },

  extractQueryKey(content: string, fnName: string): string | undefined {
    const slice = findFunctionBody(content, fnName);
    if (!slice) return undefined;

    const queryBlockMatch = slice.match(/use(?:Suspense)?Query\s*\(\s*\{([\s\S]{0,300}?)\}\s*\)/);
    if (!queryBlockMatch) return undefined;

    const match = queryBlockMatch[1].match(/queryKey:\s*([^\n,}]+)/);
    return match ? match[1].trim().replace(/,$/, "") : undefined;
  },

  extractMutationFn(content: string, fnName: string): string | undefined {
    const slice = findFunctionBody(content, fnName);
    if (!slice) return undefined;

    const match = slice.match(/mutationFn:\s*([^\n,]+)/);
    return match
      ? match[1]
          .trim()
          .replace(/,$/, "")
          .replace(/^\(.*?\)\s*=>\s*/, "")
      : undefined;
  },
};
