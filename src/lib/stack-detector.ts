import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { detectRouteFramework, detectDbFramework, detectHooksFramework } from "../adapters";

export type StackCategory =
  | "Backend"
  | "Database"
  | "Frontend"
  | "State"
  | "Auth"
  | "Validation"
  | "Testing"
  | "CSS"
  | "Build"
  | "Utils";

export interface LibEntry {
  pkg: string;
  label: string;
  category: StackCategory;
}

export interface DetectedLib extends LibEntry {
  version: string;
}

export const LIB_REGISTRY: LibEntry[] = [
  // Backend / Routes
  { pkg: "elysia", label: "Elysia", category: "Backend" },
  { pkg: "express", label: "Express", category: "Backend" },
  { pkg: "fastify", label: "Fastify", category: "Backend" },
  { pkg: "hono", label: "Hono", category: "Backend" },
  { pkg: "@nestjs/core", label: "NestJS", category: "Backend" },
  { pkg: "koa", label: "Koa", category: "Backend" },

  // Database / ORM
  { pkg: "drizzle-orm", label: "Drizzle ORM", category: "Database" },
  { pkg: "@prisma/client", label: "Prisma", category: "Database" },
  { pkg: "typeorm", label: "TypeORM", category: "Database" },
  { pkg: "sequelize", label: "Sequelize", category: "Database" },
  { pkg: "mongoose", label: "Mongoose", category: "Database" },
  { pkg: "kysely", label: "Kysely", category: "Database" },
  { pkg: "pg", label: "PostgreSQL (pg)", category: "Database" },
  { pkg: "mysql2", label: "MySQL2", category: "Database" },
  { pkg: "better-sqlite3", label: "SQLite (better-sqlite3)", category: "Database" },

  // Frontend
  { pkg: "react", label: "React", category: "Frontend" },
  { pkg: "vue", label: "Vue.js", category: "Frontend" },
  { pkg: "svelte", label: "Svelte", category: "Frontend" },
  { pkg: "solid-js", label: "SolidJS", category: "Frontend" },
  { pkg: "next", label: "Next.js", category: "Frontend" },
  { pkg: "nuxt", label: "Nuxt", category: "Frontend" },
  { pkg: "@remix-run/node", label: "Remix", category: "Frontend" },
  { pkg: "astro", label: "Astro", category: "Frontend" },
  { pkg: "@angular/core", label: "Angular", category: "Frontend" },

  // State / Data-fetching
  { pkg: "@tanstack/react-query", label: "TanStack Query", category: "State" },
  { pkg: "swr", label: "SWR", category: "State" },
  { pkg: "zustand", label: "Zustand", category: "State" },
  { pkg: "jotai", label: "Jotai", category: "State" },
  { pkg: "@reduxjs/toolkit", label: "Redux Toolkit", category: "State" },
  { pkg: "valtio", label: "Valtio", category: "State" },
  { pkg: "mobx", label: "MobX", category: "State" },

  // Auth
  { pkg: "better-auth", label: "Better Auth", category: "Auth" },
  { pkg: "next-auth", label: "NextAuth.js", category: "Auth" },
  { pkg: "lucia", label: "Lucia", category: "Auth" },
  { pkg: "@clerk/nextjs", label: "Clerk", category: "Auth" },
  { pkg: "@auth0/nextjs-auth0", label: "Auth0", category: "Auth" },
  { pkg: "passport", label: "Passport.js", category: "Auth" },

  // Validation
  { pkg: "zod", label: "Zod", category: "Validation" },
  { pkg: "valibot", label: "Valibot", category: "Validation" },
  { pkg: "yup", label: "Yup", category: "Validation" },
  { pkg: "joi", label: "Joi", category: "Validation" },
  { pkg: "class-validator", label: "class-validator", category: "Validation" },
  { pkg: "@sinclair/typebox", label: "TypeBox", category: "Validation" },

  // Testing
  { pkg: "vitest", label: "Vitest", category: "Testing" },
  { pkg: "jest", label: "Jest", category: "Testing" },
  { pkg: "@playwright/test", label: "Playwright", category: "Testing" },
  { pkg: "cypress", label: "Cypress", category: "Testing" },
  { pkg: "@testing-library/react", label: "Testing Library", category: "Testing" },

  // CSS
  { pkg: "tailwindcss", label: "Tailwind CSS", category: "CSS" },
  { pkg: "unocss", label: "UnoCSS", category: "CSS" },
  { pkg: "styled-components", label: "Styled Components", category: "CSS" },
  { pkg: "@emotion/react", label: "Emotion", category: "CSS" },
  { pkg: "@shadcn/ui", label: "shadcn/ui", category: "CSS" },

  // Build / Tooling
  { pkg: "vite", label: "Vite", category: "Build" },
  { pkg: "turbo", label: "Turborepo", category: "Build" },
  { pkg: "tsup", label: "tsup", category: "Build" },
  { pkg: "esbuild", label: "esbuild", category: "Build" },
  { pkg: "webpack", label: "Webpack", category: "Build" },

  // Utils
  { pkg: "@trpc/server", label: "tRPC", category: "Utils" },
  { pkg: "socket.io", label: "Socket.io", category: "Utils" },
  { pkg: "ws", label: "WebSockets (ws)", category: "Utils" },
  { pkg: "ioredis", label: "Redis (ioredis)", category: "Utils" },
  { pkg: "bullmq", label: "BullMQ", category: "Utils" },
  { pkg: "graphql", label: "GraphQL", category: "Utils" },
];

// Frameworks purement frontend (sans composant serveur HTTP)
// Note: next, nuxt, @remix-run/node, astro sont hybrides → exclus
const PURE_FRONTEND_PKGS = new Set(["react", "vue", "svelte", "solid-js", "preact"]);
// Frameworks hybrides SSR (frontend + backend HTTP intégré)
const HYBRID_SSR_PKGS = new Set(["next", "nuxt", "@remix-run/node", "astro"]);

/**
 * Retourne true si le projet est un frontend pur (React, Vue, Svelte…)
 * sans aucun framework backend HTTP ni SSR hybride.
 *
 * Utilisé par init.cmd.ts pour désactiver l'indexeur de routes.
 */
export function isFrontendOnlyProject(deps: Record<string, string>): boolean {
  const backendPkgs = LIB_REGISTRY.filter((l) => l.category === "Backend").map((l) => l.pkg);
  if (backendPkgs.some((p) => p in deps)) return false;
  if ([...HYBRID_SSR_PKGS].some((p) => p in deps)) return false;
  return [...PURE_FRONTEND_PKGS].some((p) => p in deps);
}

export function detectStack(deps: Record<string, string>): DetectedLib[] {
  return LIB_REGISTRY.filter((lib) => lib.pkg in deps).map((lib) => ({ ...lib, version: deps[lib.pkg] }));
}

export function detectFrameworksFromStack(deps: Record<string, string>): {
  routes: string;
  db: string;
  hooks: string;
} {
  return {
    routes: detectRouteFramework(deps),
    db: detectDbFramework(deps),
    hooks: detectHooksFramework(deps),
  };
}

export function loadDepsFromPackageJson(cwd: string): Record<string, string> {
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) return {};
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return { ...pkg.dependencies, ...pkg.devDependencies };
  } catch {
    return {};
  }
}

export function buildStackMarkdown(cwd: string): string {
  const deps = loadDepsFromPackageJson(cwd);
  const stack = detectStack(deps);
  if (!stack.length) return "";

  const categoryOrder: StackCategory[] = [
    "Backend",
    "Database",
    "Frontend",
    "State",
    "Auth",
    "Validation",
    "Testing",
    "CSS",
    "Build",
    "Utils",
  ];

  const byCategory = new Map<StackCategory, DetectedLib[]>();
  for (const lib of stack) {
    if (!byCategory.has(lib.category)) byCategory.set(lib.category, []);
    byCategory.get(lib.category)!.push(lib);
  }

  const lines: string[] = [`## Stack Technique`, ``, `| Catégorie | Lib | Version |`, `|-----------|-----|---------|`];

  for (const cat of categoryOrder) {
    const libs = byCategory.get(cat);
    if (!libs) continue;
    for (const lib of libs) {
      lines.push(`| ${cat} | **${lib.label}** | \`${lib.version}\` |`);
    }
  }

  return lines.join("\n");
}
