import { describe, expect, it } from "vitest";
import { isRtlLocale, t } from "@/lib/i18n";

describe("mobile i18n", () => {
  it("translates login title for ru and he", () => {
    expect(t("ru", "title.login")).toBe("DIMAX Монтажник");
    expect(t("he", "title.login")).toBe("DIMAX מתקין");
  });

  it("marks hebrew as rtl locale", () => {
    expect(isRtlLocale("he")).toBe(true);
    expect(isRtlLocale("en")).toBe(false);
  });
});
