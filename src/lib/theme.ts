export const installerTheme = {
  background: "#080E15",
  shell: "#0B111A",
  shellRaised: "#131821",
  shellMuted: "#1A202B",
  card: "#131821",
  cardMuted: "#1A202B",
  elevated: "#222936",
  border: "rgba(255,255,255,0.09)",
  borderStrong: "rgba(255,255,255,0.16)",
  primary: "#338EFF",
  primarySoft: "rgba(51,142,255,0.13)",
  accent: "#E4B24E",
  accentPressed: "#C9973A",
  accentWarm: "rgba(228,178,78,0.12)",
  accentEdge: "rgba(228,178,78,0.38)",
  text: "#F4F7FB",
  textOnDark: "#F4F7FB",
  textOnAccent: "#111820",
  textMuted: "#9AA8BA",
  textFaint: "#69788C",
  success: "#35D991",
  successFill: "#35D991",
  successSoft: "rgba(53,217,145,0.10)",
  warning: "#EAB44A",
  warningFill: "#EAB44A",
  warningSoft: "rgba(234,180,74,0.10)",
  danger: "#EC5752",
  dangerFill: "#EC5752",
  dangerSoft: "rgba(236,87,82,0.10)",
  info: "#338EFF",
  infoFill: "#338EFF",
  infoSoft: "rgba(51,142,255,0.12)",
  purple: "#A477E8",
  purpleSoft: "rgba(164,119,232,0.10)",
  successBorder: "rgba(53,217,145,0.30)",
  warningBorder: "rgba(234,180,74,0.35)",
  dangerBorder: "rgba(236,87,82,0.35)",
  infoBorder: "rgba(51,142,255,0.35)",
  purpleBorder: "rgba(164,119,232,0.30)",
  accentText: "#E4B24E",
  shellOverlayFaint: "rgba(255,255,255,0.035)",
  shellOverlaySubtle: "rgba(255,255,255,0.055)",
  shellOverlay: "rgba(255,255,255,0.075)",
  shellBorderSoft: "rgba(161,190,224,0.12)",
  shellBorder: "rgba(161,190,224,0.20)",
  successGlow: "rgba(77,219,145,0.18)",
  warningGlow: "rgba(240,183,62,0.18)",
  infoGlow: "rgba(34,149,255,0.20)",
  accentGlow: "rgba(240,183,62,0.22)",
  dangerGlow: "rgba(255,116,123,0.18)",
  doorMaterial: "#202C3B",
  doorMaterialInset: "rgba(188,211,238,0.18)",
  whatsapp: "#25D366",
  fontFamily: "Manrope_400Regular",
  fontFamilyMedium: "Manrope_600SemiBold",
  fontFamilyStrong: "Manrope_700Bold",
  fontFamilyDisplay: "Sora_700Bold",
  fontFamilyDisplayStrong: "Sora_800ExtraBold",
  fontFamilyMono: "JetBrainsMono_500Medium",
  radius: {
    sm: 10,
    md: 13,
    card: 16,
    xl: 21,
    glass: 26,
    pill: 999,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
  },
  layout: {
    bottomNavClearance: 112,
  },
} as const;

export type InstallerTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "purple";

export function toneColors(tone: InstallerTone) {
  switch (tone) {
    case "accent":
      return { background: installerTheme.accentWarm, border: installerTheme.accentEdge, text: installerTheme.accentText };
    case "success":
      return { background: installerTheme.successSoft, border: installerTheme.successBorder, text: installerTheme.success };
    case "warning":
      return { background: installerTheme.warningSoft, border: installerTheme.warningBorder, text: installerTheme.warning };
    case "danger":
      return { background: installerTheme.dangerSoft, border: installerTheme.dangerBorder, text: installerTheme.danger };
    case "info":
      return { background: installerTheme.infoSoft, border: installerTheme.infoBorder, text: installerTheme.info };
    case "purple":
      return { background: installerTheme.purpleSoft, border: installerTheme.purpleBorder, text: installerTheme.purple };
    default:
      return { background: installerTheme.cardMuted, border: installerTheme.border, text: installerTheme.textMuted };
  }
}
