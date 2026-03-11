/**
 * Définition d'une colonne de table.
 */
export interface ColumnDef {
  /** Nom de la colonne */
  name: string;
  /** Type de la colonne (ex: "uuid", "text", "integer") */
  type: string;
  /** Vrai si la colonne peut être NULL */
  nullable: boolean;
  /** Vrai si la colonne a une valeur par défaut */
  hasDefault: boolean;
  /** Vrai si c'est une clé primaire */
  isPk: boolean;
  /** Vrai si c'est une clé étrangère */
  isFk: boolean;
  /** Référence FK sous forme "table.colonne" (ex: "users.id") */
  references?: string;
}

/**
 * Définition d'une table.
 */
export interface TableDef {
  /** Nom SQL de la table (ex: "accounts") */
  name: string;
  /** Nom de la variable TypeScript (ex: "accountsTable") */
  varName: string;
  /** Colonnes de la table */
  columns: ColumnDef[];
  /** Chemin relatif du fichier source */
  file: string;
}

/**
 * Définition d'un enum.
 */
export interface EnumDef {
  /** Nom de l'enum */
  name: string;
  /** Valeurs possibles */
  values: string[];
}

/**
 * Adaptateur pour un ORM ou outil de schéma de base de données.
 *
 * Pour ajouter un nouvel ORM (ex: Knex) :
 * 1. Créer `src/adapters/db/knex.adapter.ts` implémentant cette interface
 * 2. Importer et ajouter dans `src/adapters/index.ts`
 *
 * @example
 * ```ts
 * export const knexAdapter: DbAdapter = {
 *   id: "knex",
 *   name: "Knex.js",
 *   packages: ["knex"],
 *   defaultFilePattern: "**\/migrations\/**\/*.ts",
 *   extract(content, filePath) { ... }
 * };
 * ```
 */
export interface DbAdapter {
  /** Identifiant unique, correspond à `config.indexers.dbSchema.framework` */
  id: string;
  /** Nom lisible affiché dans les logs */
  name: string;
  /** Noms de packages npm pour l'auto-détection */
  packages: string[];
  /** Pattern glob par défaut proposé lors de `klix init` */
  defaultFilePattern: string;
  /**
   * Extrait les tables et enums d'un fichier de schéma.
   * @param content Contenu du fichier
   * @param filePath Chemin absolu du fichier
   */
  extract(content: string, filePath: string): { tables: TableDef[]; enums: EnumDef[]; droppedTables?: string[] };
}
