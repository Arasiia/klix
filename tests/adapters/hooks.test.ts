import { describe, it, expect } from "bun:test";
import { tanstackQueryAdapter } from "../../src/adapters/hooks/tanstack-query.adapter";

describe("tanstackQueryAdapter", () => {
  it("a les métadonnées correctes", () => {
    expect(tanstackQueryAdapter.id).toBe("tanstack-query");
    expect(tanstackQueryAdapter.packages).toContain("@tanstack/react-query");
    expect(tanstackQueryAdapter.defaultFilePattern).toBeTruthy();
  });
});

describe("tanstackQueryAdapter.classifyHook", () => {
  it("classifie useQuery comme 'query'", () => {
    const content = `
export function useUsers() {
  return useQuery({ queryKey: ['users'], queryFn: fetchUsers });
}`;
    expect(tanstackQueryAdapter.classifyHook(content, "useUsers")).toBe("query");
  });

  it("classifie useSuspenseQuery comme 'query'", () => {
    const content = `
export function useUserSuspense() {
  return useSuspenseQuery({ queryKey: ['user'], queryFn: fetchUser });
}`;
    expect(tanstackQueryAdapter.classifyHook(content, "useUserSuspense")).toBe("query");
  });

  it("classifie useMutation comme 'mutation'", () => {
    const content = `
export function useCreateUser() {
  return useMutation({ mutationFn: createUser });
}`;
    expect(tanstackQueryAdapter.classifyHook(content, "useCreateUser")).toBe("mutation");
  });

  it("classifie un hook sans use* spécifique comme 'other'", () => {
    const content = `
export function useToggle() {
  const [value, setValue] = useState(false);
  return [value, setValue];
}`;
    expect(tanstackQueryAdapter.classifyHook(content, "useToggle")).toBe("other");
  });

  it("retourne 'other' si la fonction n'existe pas", () => {
    expect(tanstackQueryAdapter.classifyHook("export function unrelated() {}", "useNonExistent")).toBe("other");
  });

  it("ne confond pas useQueryClient avec useQuery", () => {
    const content = `
export function useUserUtils() {
  const client = useQueryClient();
  return client;
}`;
    expect(tanstackQueryAdapter.classifyHook(content, "useUserUtils")).toBe("other");
  });
});

describe("tanstackQueryAdapter.extractQueryKey", () => {
  it("extrait le queryKey d'un useQuery", () => {
    const content = `
export function useUsers() {
  return useQuery({ queryKey: ['users'], queryFn: fetchUsers });
}`;
    const key = tanstackQueryAdapter.extractQueryKey!(content, "useUsers");
    expect(key).toContain("users");
  });

  it("extrait un queryKey avec variable", () => {
    const content = `
export function useUser(id: string) {
  return useQuery({ queryKey: ['user', id], queryFn: () => fetchUser(id) });
}`;
    const key = tanstackQueryAdapter.extractQueryKey!(content, "useUser");
    expect(key).toContain("user");
  });

  it("retourne undefined si pas de queryKey", () => {
    const content = `export function useToggle() { return useState(false); }`;
    expect(tanstackQueryAdapter.extractQueryKey!(content, "useToggle")).toBeUndefined();
  });
});

describe("tanstackQueryAdapter.extractMutationFn", () => {
  it("extrait le mutationFn simple", () => {
    const content = `
export function useCreateUser() {
  return useMutation({ mutationFn: createUser });
}`;
    const fn = tanstackQueryAdapter.extractMutationFn!(content, "useCreateUser");
    expect(fn).toContain("createUser");
  });

  it("extrait un mutationFn sous forme de flèche", () => {
    const content = `
export function useDeleteUser() {
  return useMutation({ mutationFn: (id: string) => deleteUser(id) });
}`;
    const fn = tanstackQueryAdapter.extractMutationFn!(content, "useDeleteUser");
    expect(fn).toContain("deleteUser");
  });

  it("retourne undefined si pas de mutationFn", () => {
    const content = `export function useToggle() { return useState(false); }`;
    expect(tanstackQueryAdapter.extractMutationFn!(content, "useToggle")).toBeUndefined();
  });
});
