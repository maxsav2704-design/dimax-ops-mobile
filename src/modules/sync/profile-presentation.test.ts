import { describe, expect, it } from "vitest";
import { buildProfileQueuePresentation } from "@/modules/sync/presentation";
import type { SyncQueueSummary } from "@/modules/sync/types";

const empty: SyncQueueSummary = {
  total: 0, pending: 0, failed: 0, blocked: 0, ready_to_send: 0, next_retry_at: null,
};
const locales = [
  { locale: "en", waiting: "Checking", unknown: "could not", sameAccount: "same account", empty: "No actions waiting" },
  { locale: "ru", waiting: "Проверяем", unknown: "не удалось", sameAccount: "тот же аккаунт", empty: "Нет действий" },
  { locale: "he", waiting: "בודקים", unknown: "לא ניתן", sameAccount: "אותו חשבון", empty: "אין פעולות" },
] as const;

describe.each(locales)("profile queue presentation in $locale", ({ locale, waiting, unknown, sameAccount, empty: emptyText }) => {
  it.each([null, empty])("never reports success while a local read is pending (%j)", (summary) => {
    const result = buildProfileQueuePresentation(summary, true, false, locale);
    expect(result.state).toBe("loading");
    expect(result.tone).toBe("neutral");
    expect(result.subtitle).toContain(waiting);
    expect(result.signOutMessage).toContain(sameAccount);
  });

  it.each([null, empty])("does not trust an absent or stale summary after a read failure (%j)", (summary) => {
    const result = buildProfileQueuePresentation(summary, false, true, locale);
    expect(result.state).toBe("error");
    expect(result.tone).toBe("warning");
    expect(result.signOutMessage.toLowerCase()).toContain(unknown);
    expect(result.signOutMessage).toContain(sameAccount);
  });

  it("treats an unread queue as unknown even without an explicit error", () => {
    expect(buildProfileQueuePresentation(null, false, false, locale).state).toBe("error");
  });

  it("reports an empty queue only after a successful read", () => {
    const result = buildProfileQueuePresentation(empty, false, false, locale);
    expect(result.state).toBe("ready");
    expect(result.tone).toBe("success");
    expect(result.subtitle).toContain(emptyText);
  });

  it.each(["pending", "failed", "blocked"] as const)("includes %s work in the sign-out warning", (status) => {
    const result = buildProfileQueuePresentation({ ...empty, total: 3, [status]: 3 }, false, false, locale);
    expect(result.tone).toBe(status === "blocked" ? "danger" : "warning");
    expect(result.subtitle).toContain("3");
    expect(result.signOutMessage).toContain("3");
    expect(result.signOutMessage).toContain(sameAccount);
  });
});
