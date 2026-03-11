/**
 * Représente un hook React extrait.
 */
export interface HookEntry {
  /** Nom du hook (ex: "useAccounts") */
  name: string;
  /** Classification du hook */
  kind: "query" | "mutation" | "queryKey" | "other";
  /** Expression de la queryKey (ex: "[accountKeys.list()]") */
  queryKey?: string;
  /** Expression de la mutationFn (ex: "accountsApi.create(data)") */
  mutationFn?: string;
  /** Chemin relatif du fichier source */
  file: string;
}

/**
 * Adaptateur pour une bibliothèque de data-fetching/hooks.
 *
 * Pour ajouter une nouvelle lib (ex: SWR) :
 * 1. Créer `src/adapters/hooks/swr.adapter.ts` implémentant cette interface
 * 2. Importer et ajouter dans `src/adapters/index.ts`
 *
 * @example
 * ```ts
 * export const swrAdapter: HooksAdapter = {
 *   id: "swr",
 *   name: "SWR",
 *   packages: ["swr"],
 *   defaultFilePattern: "**\/hooks\/use-*.ts",
 *   classifyHook(content, fnName) { ... }
 * };
 * ```
 */
export interface HooksAdapter {
  /** Identifiant unique, correspond à `config.indexers.hooks.framework` */
  id: string;
  /** Nom lisible affiché dans les logs */
  name: string;
  /** Noms de packages npm pour l'auto-détection */
  packages: string[];
  /** Pattern glob par défaut proposé lors de `klix init` */
  defaultFilePattern: string;
  /**
   * Classifie un hook selon son contenu.
   * @param content Contenu complet du fichier
   * @param fnName Nom de la fonction hook
   */
  classifyHook(content: string, fnName: string): HookEntry["kind"];
  /**
   * Extrait la queryKey d'un hook de type "query".
   * @returns La queryKey sous forme de string, ou undefined
   */
  extractQueryKey?(content: string, fnName: string): string | undefined;
  /**
   * Extrait la mutationFn d'un hook de type "mutation".
   * @returns La mutationFn sous forme de string, ou undefined
   */
  extractMutationFn?(content: string, fnName: string): string | undefined;
}
