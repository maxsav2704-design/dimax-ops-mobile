import { Platform } from "react-native";

export const installerTheme = {
  background: "#F4F4F6",
  shell: "#0A0A0A",
  shellRaised: "#1A1A1A",
  shellMuted: "#2A2A2D",
  card: "#FFFFFF",
  cardMuted: "#FAFAFB",
  border: "#E5E5E7",
  borderStrong: "#CFCFD2",
  primary: "#1A1A1A",
  primarySoft: "#FFF5D6",
  accent: "#FFC83A",
  accentPressed: "#F5BC2F",
  accentWarm: "#FFF5D6",
  accentEdge: "#F0D88A",
  text: "#1A1A1A",
  textOnDark: "#F4F4F6",
  textMuted: "#6B6B6F",
  textFaint: "#A5A5A9",
  success: "#2D8F4E",
  successFill: "#4CAF50",
  successSoft: "#E8F7EE",
  warning: "#A65300",
  warningFill: "#FF8A3D",
  warningSoft: "#FFF3E0",
  danger: "#C0392B",
  dangerFill: "#E74C3C",
  dangerSoft: "#FDE9E7",
  info: "#1F5FB8",
  infoFill: "#2B7FFF",
  infoSoft: "#E3F0FF",
  purple: "#6B3FA0",
  purpleSoft: "#F1E9FA",
  whatsapp: "#25D366",
  fontFamily: Platform.select({
    ios: "System",
    android: "sans-serif",
    default: "system-ui",
  }),
  radius: {
    sm: 4,
    md: 6,
    card: 8,
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
    bottomNavClearance: 88,
  },
} as const;

export type InstallerTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "purple";

export function toneColors(tone: InstallerTone) {
  switch (tone) {
    case "accent":
      return { background: installerTheme.accentWarm, border: installerTheme.accentEdge, text: "#8A6C1F" };
    case "success":
      return { background: installerTheme.successSoft, border: "#B8E5C4", text: installerTheme.success };
    case "warning":
      return { background: installerTheme.warningSoft, border: "#FFD4A3", text: installerTheme.warning };
    case "danger":
      return { background: installerTheme.dangerSoft, border: "#F5C2BC", text: installerTheme.danger };
    case "info":
      return { background: installerTheme.infoSoft, border: "#B5D1F0", text: installerTheme.info };
    case "purple":
      return { background: installerTheme.purpleSoft, border: "#D8C2F0", text: installerTheme.purple };
    default:
      return { background: installerTheme.cardMuted, border: installerTheme.border, text: installerTheme.textMuted };
  }
}
