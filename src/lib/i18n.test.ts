import { describe, expect, it } from "vitest";
import { isRtlLocale, t, translations } from "@/lib/i18n";

const localeIndependentKeys = new Set(["locale.en", "locale.ru", "locale.he"]);

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]).sort();
}

describe("mobile i18n", () => {
  it("translates login title for ru and he", () => {
    expect(t("ru", "title.login")).toBe("DIMAX Монтажник");
    expect(t("he", "title.login")).toBe("DIMAX מתקין");
  });

  it("marks hebrew as rtl locale", () => {
    expect(isRtlLocale("he")).toBe(true);
    expect(isRtlLocale("en")).toBe(false);
  });

  it.each(["ru", "he"] as const)("keeps the %s catalog complete and translated", (locale) => {
    const englishKeys = Object.keys(translations.en) as (keyof typeof translations.en)[];
    expect(Object.keys(translations[locale]).sort()).toEqual([...englishKeys].sort());

    const untranslated = englishKeys.filter(
      (key) => translations[locale][key] === translations.en[key] && !localeIndependentKeys.has(key),
    );
    expect(untranslated).toEqual([]);

    for (const key of englishKeys) {
      expect(placeholders(translations[locale][key]), key).toEqual(
        placeholders(translations.en[key]),
      );
    }
  });

  it("uses native language labels in the locale switcher", () => {
    expect(t("en", "locale.en")).toBe("EN");
    expect(t("en", "locale.ru")).toBe("РУ");
    expect(t("en", "locale.he")).toBe("עב");
  });
});
