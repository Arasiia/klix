/**
 * Représente un endpoint HTTP extrait d'un fichier de routes.
 */
export interface RouteEntry {
  /** Méthode HTTP en majuscules : "GET", "POST", "PUT", "PATCH", "DELETE" */
  method: string;
  /** Path complet (apiPrefix + routePrefix + routePath) */
  path: string;
  /** Noms des champs du body, séparés par des virgules (ex: "name, type, amount") */
  body?: string;
  /** Référence au handler (ex: "userController.getAll") */
  handler?: string;
  /** Chemin relatif du fichier source */
  file: string;
}

/**
 * Adaptateur pour un framework de routing HTTP.
 *
 * Pour ajouter un nouveau framework (ex: Koa) :
 * 1. Créer `src/adapters/routes/koa.adapter.ts` implémentant cette interface
 * 2. Importer et ajouter dans `src/adapters/index.ts`
 *
 * @example
 * ```ts
 * export const koaAdapter: RouteAdapter = {
 *   id: "koa",
 *   name: "Koa",
 *   packages: ["koa", "@koa/router"],
 *   defaultFilePattern: "**\/routes\/**\/*.ts",
 *   extract(content, filePath, apiPrefix) { ... }
 * };
 * ```
 */
export interface RouteAdapter {
  /** Identifiant unique, correspond à `config.indexers.routes.framework` */
  id: string;
  /** Nom lisible affiché dans les logs et les index */
  name: string;
  /** Noms de packages npm pour l'auto-détection depuis package.json */
  packages: string[];
  /** Pattern glob par défaut proposé lors de `klix init` */
  defaultFilePattern: string;
  /**
   * Extrait les routes d'un fichier source.
   * @param content Contenu du fichier
   * @param filePath Chemin absolu du fichier
   * @param apiPrefix Préfixe global de l'API (ex: "/api")
   */
  extract(content: string, filePath: string, apiPrefix: string): RouteEntry[];
}
