import Ionicons from "@expo/vector-icons/Ionicons";
import React, { type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import { installerTheme, toneColors, type InstallerTone } from "@/lib/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
const PlatformMono = "monospace";

export function DimaxMark({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.mark, compact && styles.markCompact]}>
      <Text style={[styles.markText, compact && styles.markTextCompact]}>DIMAX</Text>
    </View>
  );
}

export function ScreenHero({
  eyebrow,
  title,
  subtitle,
  right,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string | null;
  right?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        <DimaxMark />
        {right}
      </View>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.heroTitle}>{title}</Text>
      {subtitle ? <Text style={styles.heroSubtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

export function SectionCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionHeader({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: string | number | null;
  action?: ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {meta !== undefined && meta !== null ? (
          <View style={styles.counter}>
            <Text style={styles.counterText}>{meta}</Text>
          </View>
        ) : null}
      </View>
      {action}
    </View>
  );
}

export function StatusPill({
  label,
  tone = "neutral",
  icon,
}: {
  label: string;
  tone?: InstallerTone;
  icon?: IconName;
}) {
  const colors = toneColors(tone);
  return (
    <View style={[styles.statusPill, { backgroundColor: colors.background, borderColor: colors.border }]}>
      {icon ? <Ionicons name={icon} size={12} color={colors.text} /> : null}
      <Text style={[styles.statusPillText, { color: colors.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function MetricTile({
  label,
  value,
  meta,
  tone = "accent",
}: {
  label: string;
  value: string | number;
  meta?: string | null;
  tone?: InstallerTone;
}) {
  const colors = toneColors(tone);
  return (
    <View style={[styles.metric, { borderLeftColor: colors.text }]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1}>{value}</Text>
      {meta ? <Text style={styles.metricMeta} numberOfLines={2}>{meta}</Text> : null}
    </View>
  );
}

export function ActionButton({
  label,
  icon,
  variant = "primary",
  loading = false,
  style,
  ...props
}: PressableProps & {
  label: string;
  icon?: IconName;
  variant?: "primary" | "secondary" | "danger" | "dark";
  loading?: boolean;
  style?: ViewStyle | ViewStyle[];
}) {
  const foreground =
    variant === "primary"
      ? installerTheme.text
      : variant === "danger"
        ? installerTheme.danger
        : variant === "dark"
          ? installerTheme.textOnDark
          : installerTheme.text;
  return (
    <Pressable
      {...props}
      style={({ pressed }) => [
        styles.action,
        variant === "primary" && styles.actionPrimary,
        variant === "secondary" && styles.actionSecondary,
        variant === "danger" && styles.actionDanger,
        variant === "dark" && styles.actionDark,
        pressed && styles.actionPressed,
        props.disabled && styles.actionDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={foreground} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={17} color={foreground} /> : null}
          <Text style={[styles.actionText, { color: foreground }]} numberOfLines={2}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  tone = "light",
  ...props
}: PressableProps & {
  icon: IconName;
  label: string;
  tone?: "light" | "dark" | "accent";
}) {
  const color = tone === "dark" ? installerTheme.textOnDark : installerTheme.text;
  return (
    <Pressable
      {...props}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.iconButton,
        tone === "dark" && styles.iconButtonDark,
        tone === "accent" && styles.iconButtonAccent,
        pressed && styles.actionPressed,
      ]}
    >
      <Ionicons name={icon} size={19} color={color} />
    </Pressable>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  dark = false,
}: {
  value: T;
  options: Array<{ value: T; label: string; count?: number }>;
  onChange: (value: T) => void;
  dark?: boolean;
}) {
  return (
    <View style={[styles.segmented, dark && styles.segmentedDark]}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.segment, active && (dark ? styles.segmentActiveAccent : styles.segmentActiveDark)]}
          >
            <Text
              style={[
                styles.segmentText,
                dark && styles.segmentTextDark,
                active && (dark ? styles.segmentTextAccent : styles.segmentTextActive),
              ]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
            {option.count !== undefined ? (
              <Text style={[styles.segmentCount, active && styles.segmentCountActive]}>{option.count}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function EmptyState({
  icon = "checkmark-circle-outline",
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string | null;
  action?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={22} color={installerTheme.textFaint} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {description ? <Text style={styles.emptyDescription}>{description}</Text> : null}
      {action}
    </View>
  );
}

export function Row({
  icon,
  title,
  subtitle,
  value,
  tone = "neutral",
  onPress,
}: {
  icon: IconName;
  title: string;
  subtitle?: string | null;
  value?: string | null;
  tone?: InstallerTone;
  onPress?: () => void;
}) {
  const colors = toneColors(tone);
  const content = (
    <>
      <View style={[styles.rowIcon, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <Ionicons name={icon} size={17} color={colors.text} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {onPress ? <Ionicons name="chevron-forward" size={16} color={installerTheme.textFaint} /> : null}
    </>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      {content}
    </Pressable>
  ) : (
    <View style={styles.row}>{content}</View>
  );
}

export const mobileText = StyleSheet.create({
  title: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamily,
    fontSize: 20,
    fontWeight: "700",
  },
  body: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamily,
    fontSize: 13,
    lineHeight: 20,
  },
  label: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamily,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  mono: {
    color: installerTheme.textMuted,
    fontFamily: PlatformMono,
    fontSize: 11,
  } satisfies TextStyle,
});

const styles = StyleSheet.create({
  mark: {
    alignSelf: "flex-start",
    backgroundColor: installerTheme.accent,
    borderRadius: installerTheme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  markCompact: {
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  markText: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamily,
    fontSize: 10,
    fontWeight: "900",
  },
  markTextCompact: {
    fontSize: 8,
  },
  hero: {
    backgroundColor: installerTheme.shell,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 20,
  },
  heroTop: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  eyebrow: {
    color: installerTheme.textFaint,
    fontFamily: installerTheme.fontFamily,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 5,
  },
  heroTitle: {
    color: installerTheme.textOnDark,
    fontFamily: installerTheme.fontFamily,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "800",
  },
  heroSubtitle: {
    color: installerTheme.textFaint,
    fontFamily: installerTheme.fontFamily,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  card: {
    backgroundColor: installerTheme.card,
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    borderColor: installerTheme.border,
    padding: 14,
  },
  sectionHeader: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sectionTitleRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  sectionTitle: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamily,
    fontSize: 14,
    fontWeight: "800",
    flexShrink: 1,
  },
  counter: {
    backgroundColor: installerTheme.background,
    borderRadius: installerTheme.radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  counterText: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamily,
    fontSize: 9,
    fontWeight: "800",
  },
  statusPill: {
    maxWidth: "100%",
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: installerTheme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusPillText: {
    fontFamily: installerTheme.fontFamily,
    fontSize: 10,
    fontWeight: "800",
    flexShrink: 1,
  },
  metric: {
    flex: 1,
    minWidth: 96,
    minHeight: 82,
    backgroundColor: installerTheme.card,
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    borderColor: installerTheme.border,
    borderLeftWidth: 3,
    padding: 11,
  },
  metricLabel: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamily,
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  metricValue: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamily,
    fontSize: 21,
    fontWeight: "800",
    marginTop: 5,
  },
  metricMeta: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamily,
    fontSize: 9,
    lineHeight: 12,
    marginTop: 3,
  },
  action: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: installerTheme.radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  actionPrimary: {
    backgroundColor: installerTheme.accent,
    borderWidth: 1,
    borderColor: installerTheme.accent,
  },
  actionSecondary: {
    backgroundColor: installerTheme.card,
    borderWidth: 1,
    borderColor: installerTheme.borderStrong,
  },
  actionDanger: {
    backgroundColor: installerTheme.dangerSoft,
    borderWidth: 1,
    borderColor: "#F5C2BC",
  },
  actionDark: {
    backgroundColor: installerTheme.primary,
    borderWidth: 1,
    borderColor: installerTheme.primary,
  },
  actionPressed: {
    opacity: 0.72,
  },
  actionDisabled: {
    opacity: 0.42,
  },
  actionText: {
    fontFamily: installerTheme.fontFamily,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
    flexShrink: 1,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: installerTheme.radius.pill,
    borderWidth: 1,
    borderColor: installerTheme.border,
    backgroundColor: installerTheme.card,
  },
  iconButtonDark: {
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  iconButtonAccent: {
    borderColor: installerTheme.accent,
    backgroundColor: installerTheme.accent,
  },
  segmented: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: installerTheme.background,
    borderRadius: installerTheme.radius.pill,
    padding: 3,
    gap: 3,
  },
  segmentedDark: {
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  segment: {
    flex: 1,
    minHeight: 34,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: installerTheme.radius.pill,
    paddingHorizontal: 6,
  },
  segmentActiveDark: {
    backgroundColor: installerTheme.primary,
  },
  segmentActiveAccent: {
    backgroundColor: installerTheme.accent,
  },
  segmentText: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamily,
    fontSize: 10,
    fontWeight: "800",
    flexShrink: 1,
  },
  segmentTextDark: {
    color: installerTheme.textFaint,
  },
  segmentTextActive: {
    color: installerTheme.textOnDark,
  },
  segmentTextAccent: {
    color: installerTheme.text,
  },
  segmentCount: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamily,
    fontSize: 8,
    fontWeight: "800",
  },
  segmentCountActive: {
    color: installerTheme.text,
  },
  empty: {
    minHeight: 150,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: installerTheme.radius.pill,
    backgroundColor: installerTheme.background,
    marginBottom: 10,
  },
  emptyTitle: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamily,
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyDescription: {
    maxWidth: 280,
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamily,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 5,
    marginBottom: 12,
  },
  row: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: installerTheme.border,
  },
  rowPressed: {
    backgroundColor: installerTheme.cardMuted,
  },
  rowIcon: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: installerTheme.radius.md,
    borderWidth: 1,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamily,
    fontSize: 12,
    fontWeight: "800",
  },
  rowSubtitle: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamily,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 2,
  },
  rowValue: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamily,
    fontSize: 11,
    fontWeight: "800",
  },
});
