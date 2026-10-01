const context = Object.freeze({ ownerKey: "preview-company:preview-installer" });
export const getDatabaseContext = () => context;
export const withDatabaseContext = async <T,>(requested: unknown, operation: () => Promise<T>) => {
  if (requested !== context) throw new Error("TEST: session changed");
  return operation();
};
