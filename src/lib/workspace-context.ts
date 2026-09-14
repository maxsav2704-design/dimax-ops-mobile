import { getAuthSessionGeneration } from "@/lib/api";
import { getDatabaseContext, withDatabaseContext, type DatabaseContext } from "@/lib/db";
import { SessionChangedError } from "@/lib/errors";

export type WorkspaceContext = Readonly<{
  database: DatabaseContext | null;
  authGeneration: number;
}>;

export function captureWorkspaceContext(): WorkspaceContext {
  return { database: getDatabaseContext(), authGeneration: getAuthSessionGeneration() };
}

export function assertWorkspaceContext(context: WorkspaceContext): void {
  if (
    !context.database ||
    context.database !== getDatabaseContext() ||
    context.authGeneration !== getAuthSessionGeneration()
  ) {
    throw new SessionChangedError();
  }
}

// Serialize only local work with account activation, never a network request.
export function withWorkspaceDatabase<T>(
  context: WorkspaceContext,
  operation: () => Promise<T>,
): Promise<T> {
  return withDatabaseContext(context.database, () => {
    assertWorkspaceContext(context);
    return operation();
  });
}
