import { describe, expect, it } from "vitest";
import { installerTheme, toneColors } from "./theme";

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
