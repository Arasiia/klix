/**
 * Adaptateur pour un langage de programmation.
 * Fournit les patterns regex utilisés par les indexeurs functions et types.
 *
 * Pour ajouter un nouveau langage (ex: Kotlin) :
 * 1. Créer `src/adapters/language/kotlin.adapter.ts` implémentant cette interface
 * 2. Importer et ajouter dans `src/adapters/index.ts`
 *
 * @example
 * ```ts
 * export const kotlinAdapter: LanguageAdapter = {
 *   id: "kotlin",
 *   name: "Kotlin",
 *   extensions: [".kt", ".kts"],
 *   exportFunctionPattern: /^fun\s+(\w+)\s*\(([^)]*)\)/gm,
 *   exportConstArrowPattern: /^val\s+(\w+)\s*=\s*\{([^}]*)->/gm,
 *   interfacePattern: /interface\s+(\w+)\s*\{([^}]+)\}/gs,
 *   typeAliasPattern: /typealias\s+(\w+)\s*=\s*([^\n]+)/g,
 *   enumPattern: /enum\s+class\s+(\w+)\s*\{([^}]+)\}/gs,
 * };
 * ```
 *
 * Conventions des groupes de capture :
 * - `exportFunctionPattern` : groupe 2 = async?, groupe 3 = nom, groupe 4 = params
 * - `exportConstArrowPattern` : groupe 1 = nom, groupe 2 = async?, groupe 3 = params
 * - `interfacePattern` : groupe 1 = nom, groupe 2 = corps
 * - `typeAliasPattern` : groupe 1 = nom, groupe 2 = valeur
 * - `enumPattern` : groupe 1 = nom, groupe 2 = corps
 */
export interface LanguageAdapter {
  /** Identifiant unique, correspond à `config.language` */
  id: string;
  /** Nom lisible affiché dans les logs */
  name: string;
  /** Extensions de fichiers gérées (ex: [".ts", ".tsx"]) */
  extensions: string[];
  /**
   * Détecte les fonctions exportées (`export function name(params)`)
   * Groupes attendus : [1]=full prefix, [2]=async?, [3]=nom, [4]=params
   */
  exportFunctionPattern: RegExp;
  /**
   * Détecte les constantes fléchées exportées (`export const fn = (params) =>`)
   * Groupes attendus : [1]=nom, [2]=async?, [3]=params
   */
  exportConstArrowPattern: RegExp;
  /**
   * Détecte les interfaces exportées
   * Groupes attendus : [1]=nom, [2]=corps
   */
  interfacePattern: RegExp;
  /**
   * Détecte les type aliases exportées
   * Groupes attendus : [1]=nom, [2]=valeur
   */
  typeAliasPattern: RegExp;
  /**
   * Détecte les enums TypeScript exportés
   * Groupes attendus : [1]=nom, [2]=corps
   */
  enumPattern: RegExp;
  /** Si vrai, l'indexeur functions extrait aussi les méthodes de service */
  extractServiceMethods?: boolean;
}
