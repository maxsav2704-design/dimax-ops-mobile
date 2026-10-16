import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { installerTheme, toneColors } from "./theme";

const MOBILE_ROOT = path.resolve(__dirname, "..", "..");
const SCREEN_DIRS = ["app", "src"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

function literalFontSizes(file: string): Array<{ line: number; size: number }> {
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .flatMap((text, index) =>
      Array.from(text.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)\b/g), (match) => ({ line: index + 1, size: Number(match[1]) })),
    );
}

describe("installerTheme", () => {
  it("keeps the Lovable installer visual foundation", () => {
    expect(installerTheme.accent).toBe("#E4B24E");
    expect(installerTheme.background).toBe("#080E15");
    expect(installerTheme.card).toBe("#131821");
    expect(installerTheme.primary).toBe("#338EFF");
    expect(installerTheme.fontFamily).toBe("Manrope_400Regular");
    expect(installerTheme.fontFamilyStrong).toBe("Manrope_700Bold");
    expect(installerTheme.fontFamilyDisplayStrong).toBe("Sora_800ExtraBold");
    expect(installerTheme.fontFamilyMono).toBe("JetBrainsMono_500Medium");
    expect(installerTheme.radius.card).toBe(16);
    expect(installerTheme.radius.glass).toBe(26);
  });

  it("defines a field-readable type scale with a 12px caption floor", () => {
    expect(installerTheme.type).toEqual({ caption: 12, meta: 13, body: 15, title: 17, display: 22 });
    expect(installerTheme.maxFontScale).toBe(1.4);
  });

  it("keeps every screen font size at or above the caption floor", () => {
    const tooSmall = SCREEN_DIRS.flatMap((dir) => sourceFiles(path.join(MOBILE_ROOT, dir)))
      .flatMap((file) =>
        literalFontSizes(file)
          .filter(({ size }) => size < installerTheme.type.caption)
          .map(({ line, size }) => `${path.relative(MOBILE_ROOT, file)}:${line} fontSize ${size}`),
      );
    expect(tooSmall).toEqual([]);
  });

  it("maps semantic tones without duplicating raw component colors", () => {
    expect(toneColors("success")).toEqual({
      background: installerTheme.successSoft,
      border: installerTheme.successBorder,
      text: installerTheme.success,
    });
    expect(toneColors("danger")).toEqual({
      background: installerTheme.dangerSoft,
      border: installerTheme.dangerBorder,
      text: installerTheme.danger,
    });
  });
});
