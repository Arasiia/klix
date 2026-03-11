import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { classifyHook, extractQueryKey, extractMutationFn, runHooksIndexer } from "../../src/indexers/hooks.indexer";
import { DEFAULT_CONFIG } from "../../src/lib/config";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "klix-hooks-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("classifyHook", () => {
  it("classifie un hook useQuery comme 'query'", () => {
    const content = `
export function useUsers() {
  return useQuery({ queryKey: ['users'], queryFn: fetchUsers });
}`;
    expect(classifyHook(content, "useUsers")).toBe("query");
  });

  it("classifie un hook useSuspenseQuery comme 'query'", () => {
    const content = `
export function useUserSuspense() {
  return useSuspenseQuery({ queryKey: ['user'], queryFn: fetchUser });
}`;
    expect(classifyHook(content, "useUserSuspense")).toBe("query");
  });

  it("classifie un hook useMutation comme 'mutation'", () => {
    const content = `
export function useCreateUser() {
  return useMutation({ mutationFn: createUser });
}`;
    expect(classifyHook(content, "useCreateUser")).toBe("mutation");
  });

  it("classifie un hook sans useQuery/useMutation comme 'other'", () => {
    const content = `
export function useToggle() {
  const [value, setValue] = useState(false);
  return [value, setValue];
}`;
    expect(classifyHook(content, "useToggle")).toBe("other");
  });

  it("retourne 'other' si la fonction n'existe pas", () => {
    const content = `export function unrelated() {}`;
    expect(classifyHook(content, "useNonExistent")).toBe("other");
  });

  it("ne confond pas useQueryClient avec useQuery", () => {
    const content = `
export function useUserUtils() {
  const client = useQueryClient();
  return client;
}`;
    expect(classifyHook(content, "useUserUtils")).toBe("other");
  });
});

describe("extractQueryKey", () => {
  it("extrait le queryKey d'un useQuery", () => {
    const content = `
export function useUsers() {
  return useQuery({ queryKey: ['users'], queryFn: fetchUsers });
}`;
    const key = extractQueryKey(content, "useUsers");
    expect(key).toContain("users");
  });

  it("extrait un queryKey avec variable", () => {
    const content = `
export function useUser(id: string) {
  return useQuery({ queryKey: ['user', id], queryFn: () => fetchUser(id) });
}`;
    const key = extractQueryKey(content, "useUser");
    expect(key).toContain("user");
  });

  it("retourne undefined si pas de queryKey", () => {
    const content = `
export function useToggle() {
  return useState(false);
}`;
    const key = extractQueryKey(content, "useToggle");
    expect(key).toBeUndefined();
  });
});

describe("extractMutationFn", () => {
  it("extrait le mutationFn d'un useMutation", () => {
    const content = `
export function useCreateUser() {
  return useMutation({ mutationFn: createUser });
}`;
    const fn = extractMutationFn(content, "useCreateUser");
    expect(fn).toContain("createUser");
  });

  it("extrait un mutationFn sous forme de flèche", () => {
    const content = `
export function useDeleteUser() {
  return useMutation({ mutationFn: (id: string) => deleteUser(id) });
}`;
    const fn = extractMutationFn(content, "useDeleteUser");
    expect(fn).toContain("deleteUser");
  });

  it("retourne undefined si pas de mutationFn", () => {
    const content = `export function useToggle() { return useState(false); }`;
    const fn = extractMutationFn(content, "useToggle");
    expect(fn).toBeUndefined();
  });
});

describe("runHooksIndexer", () => {
  it("génère le header avec le nom du projet", () => {
    const config = { ...DEFAULT_CONFIG, name: "my-app", exclude: [] };
    const output = runHooksIndexer(tmpDir, config);
    expect(output).toContain("# HOOKS — my-app");
    expect(output).toContain("framework: tanstack-query");
  });

  it("indexe les hooks depuis des fichiers réels", () => {
    mkdirSync(join(tmpDir, "src", "hooks"), { recursive: true });
    writeFileSync(
      join(tmpDir, "src", "hooks", "use-users.ts"),
      `
export function useUsers() {
  return useQuery({ queryKey: ['users'], queryFn: fetchUsers });
}

export function useCreateUser() {
  return useMutation({ mutationFn: createUser });
}
`,
    );
    const config = {
      ...DEFAULT_CONFIG,
      exclude: [],
      indexers: {
        ...DEFAULT_CONFIG.indexers,
        hooks: {
          enabled: true,
          filePattern: "src/hooks/use-*.ts",
          framework: "tanstack-query",
        },
      },
    };
    const output = runHooksIndexer(tmpDir, config);
    expect(output).toContain("useUsers");
    expect(output).toContain("useCreateUser");
    expect(output).toContain("Queries");
    expect(output).toContain("Mutations");
  });

  it("affiche les query keys séparément", () => {
    mkdirSync(join(tmpDir, "src", "hooks"), { recursive: true });
    writeFileSync(
      join(tmpDir, "src", "hooks", "use-query-keys.ts"),
      `
export const usersKeys = {
  all: ['users'],
  detail: (id: string) => ['users', id],
};
`,
    );
    const config = {
      ...DEFAULT_CONFIG,
      exclude: [],
      indexers: {
        ...DEFAULT_CONFIG.indexers,
        hooks: {
          enabled: true,
          filePattern: "src/hooks/use-*.ts",
          framework: "tanstack-query",
        },
      },
    };
    const output = runHooksIndexer(tmpDir, config);
    expect(output).toContain("## Query Keys");
    expect(output).toContain("usersKeys");
  });

  it("affiche 0 hooks si aucun fichier trouvé", () => {
    const config = {
      ...DEFAULT_CONFIG,
      exclude: [],
      indexers: {
        ...DEFAULT_CONFIG.indexers,
        hooks: {
          enabled: true,
          filePattern: "nonexistent/**",
          framework: "tanstack-query",
        },
      },
    };
    const output = runHooksIndexer(tmpDir, config);
    expect(output).toContain("0 hooks");
  });
});
