import { clearAuthenticatedSession } from "@/lib/api";
import { deactivateDb } from "@/lib/db";
import { SessionChangedError } from "@/lib/errors";

type WorkspaceCleanup = {
  isCurrent: () => boolean;
  onCleared: () => void;
  forgetSessionGeneration?: number;
};

export async function clearAuthWorkspace({
  isCurrent,
  onCleared,
  forgetSessionGeneration,
}: WorkspaceCleanup): Promise<void> {
  if (!isCurrent()) return;
  let failure: unknown;
  try {
    if (forgetSessionGeneration !== undefined) {
      await clearAuthenticatedSession(forgetSessionGeneration);
    }
  } catch (error) {
    if (error instanceof SessionChangedError) return;
    failure = error;
  }

  if (!isCurrent()) return;
  try {
    // Close the handle, never delete an account database or its pending work.
    await deactivateDb();
  } catch (error) {
    failure ??= error;
  }
  if (!isCurrent()) return;
  onCleared();
  if (failure !== undefined) throw failure;
}
