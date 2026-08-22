import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { type ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  type PressableProps,
  StyleSheet,
  Text as NativeText,
  type TextProps,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
} from "react-native-svg";
import { installerTheme, toneColors, type InstallerTone } from "@/lib/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export function BrandText({ style, ...props }: TextProps) {
  const flattened = StyleSheet.flatten(style) ?? {};
  const requestedFamily = flattened.fontFamily;
  const requestedWeight = String(flattened.fontWeight ?? "400");
  const numericWeight = Number.parseInt(requestedWeight, 10);
  const strong = requestedWeight === "bold" || (Number.isFinite(numericWeight) && numericWeight >= 600);
  const medium = Number.isFinite(numericWeight) && numericWeight >= 500;
  const fontFamily =
    requestedFamily === "monospace"
      ? installerTheme.fontFamilyMono
      : requestedFamily && requestedFamily !== installerTheme.fontFamily
        ? requestedFamily
        : strong
          ? installerTheme.fontFamilyStrong
          : medium
            ? installerTheme.fontFamilyMedium
            : installerTheme.fontFamily;

  return (
    <NativeText
      {...props}
      style={[styles.brandText, style, { fontFamily, fontWeight: undefined }]}
    />
  );
}

const Text = BrandText;

export function BrandMark({ compact = false }: { compact?: boolean }) {
  const size = compact ? 24 : 32;
  return (
    <View style={[styles.brandMark, compact && styles.brandMarkCompact]}>
      <Svg width={size} height={size} viewBox="0 0 32 32" accessibilityElementsHidden>
        <Defs>
          <SvgLinearGradient id="dimaxGold" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={installerTheme.accent} />
            <Stop offset="1" stopColor={installerTheme.accentPressed} />
          </SvgLinearGradient>
        </Defs>
        <Path
          d="M6 3h9c7 0 11 5 11 13S22 29 15 29H6z"
          fill="none"
          stroke="url(#dimaxGold)"
          strokeWidth={2.2}
        />
        <Path d="M12 9h3c3.6 0 5.6 2.6 5.6 7s-2 7-5.6 7h-3z" fill="url(#dimaxGold)" opacity={0.55} />
      </Svg>
      <View>
        <Text style={[styles.brandName, compact && styles.brandNameCompact]}>DIMAX</Text>
        <Text style={[styles.brandProduct, compact && styles.brandProductCompact]}>INSTALLER</Text>
      </View>
    </View>
  );
}

export const DimaxMark = BrandMark;

export function ScreenHero({
  eyebrow,
  title,
  subtitle,
  right,
  children,
  showMark = true,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string | null;
  right?: ReactNode;
  children?: ReactNode;
  showMark?: boolean;
}) {
  return (
    <View style={styles.hero}>
      {showMark || right ? (
        <View style={[styles.heroTop, !showMark && styles.heroTopActionsOnly]}>
          {showMark ? <BrandMark /> : null}
          {right}
        </View>
      ) : null}
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
  return (
    <LinearGradient
      colors={["rgba(255,255,255,0.035)", "rgba(8,14,21,0.82)"]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[styles.card, style]}
    >
      {children}
    </LinearGradient>
  );
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

export function ProgressRing({
  value,
  size = 52,
  stroke = 4,
  tone = installerTheme.primary,
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: string;
  label?: string;
}) {
  const normalized = Math.max(0, Math.min(100, value));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: normalized, text: label ?? `${normalized}%` }}
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} style={styles.progressRingSvg}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={installerTheme.borderStrong}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference - (circumference * normalized) / 100}
          fill="none"
        />
      </Svg>
      <View style={styles.progressRingLabel}>
        <Text style={styles.progressRingText}>{label ?? `${normalized}%`}</Text>
      </View>
    </View>
  );
}

export function MetricTile({
  label,
  value,
  meta,
  tone = "accent",
  style,
}: {
  label: string;
  value: string | number;
  meta?: string | null;
  tone?: InstallerTone;
  style?: ViewStyle | ViewStyle[];
}) {
  const colors = toneColors(tone);
  return (
    <View style={[styles.metric, { borderStartColor: colors.text }, style]}>
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
      ? installerTheme.textOnAccent
      : variant === "danger"
        ? installerTheme.danger
        : variant === "dark"
          ? installerTheme.textOnDark
          : installerTheme.text;
  return (
    <Pressable
      {...props}
      accessibilityLabel={props.accessibilityLabel ?? label}
      accessibilityRole={props.accessibilityRole ?? "button"}
      accessibilityState={{
        ...props.accessibilityState,
        busy: loading,
        disabled: Boolean(props.disabled || loading),
      }}
      disabled={props.disabled || loading}
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
      {variant === "primary" ? (
        <LinearGradient
          pointerEvents="none"
          colors={[installerTheme.accent, "#C58D2F"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.actionGradient}
        />
      ) : null}
      {loading ? (
        <ActivityIndicator size="small" color={foreground} />
      ) : (
        <>
          {icon ? <Ionicons pointerEvents="none" name={icon} size={17} color={foreground} /> : null}
          <View pointerEvents="none" style={styles.actionTextWrap}>
            <Text style={[styles.actionText, { color: foreground }]} numberOfLines={2}>
              {label}
            </Text>
          </View>
        </>
      )}
    </Pressable>
  );
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  busy = false,
  confirmIcon,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  busy?: boolean;
  confirmIcon?: IconName;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View style={styles.dialogRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
          style={styles.dialogBackdrop}
          onPress={onCancel}
        />
        <View
          accessibilityViewIsModal
          accessibilityRole="alert"
          style={styles.dialogPanel}
        >
          <View style={[styles.dialogIcon, danger && styles.dialogIconDanger]}>
            <Ionicons
              name={danger ? "alert-circle-outline" : "help-circle-outline"}
              size={24}
              color={danger ? installerTheme.danger : installerTheme.info}
            />
          </View>
          <Text style={styles.dialogTitle}>{title}</Text>
          <Text style={styles.dialogMessage}>{message}</Text>
          <View style={styles.dialogActions}>
            <ActionButton
              label={cancelLabel}
              variant="secondary"
              disabled={busy}
              style={styles.dialogAction}
              onPress={onCancel}
            />
            <ActionButton
              label={confirmLabel}
              icon={confirmIcon || (danger ? "alert-circle-outline" : "checkmark")}
              variant={danger ? "danger" : "primary"}
              loading={busy}
              style={styles.dialogAction}
              onPress={onConfirm}
            />
          </View>
        </View>
      </View>
    </Modal>
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
  const color =
    tone === "dark"
      ? installerTheme.textOnDark
      : tone === "accent"
        ? installerTheme.textOnAccent
        : installerTheme.text;
  return (
    <Pressable
      {...props}
      accessibilityLabel={label}
      accessibilityRole={props.accessibilityRole ?? "button"}
      accessibilityState={{ ...props.accessibilityState, disabled: Boolean(props.disabled) }}
      hitSlop={props.hitSlop ?? 6}
      style={({ pressed }) => [
        styles.iconButton,
        tone === "dark" && styles.iconButtonDark,
        tone === "accent" && styles.iconButtonAccent,
        pressed && styles.actionPressed,
      ]}
    >
      <Ionicons pointerEvents="none" name={icon} size={19} color={color} />
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
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.label}
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
      {value ? <Text style={styles.rowValue} numberOfLines={1}>{value}</Text> : null}
      {onPress ? <Ionicons name="chevron-forward" size={16} color={installerTheme.textFaint} /> : null}
    </>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, subtitle, value].filter(Boolean).join(". ")}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={styles.row}>{content}</View>
  );
}

export const mobileText = StyleSheet.create({
  title: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamilyStrong,
    fontSize: 20,
  },
  body: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamily,
    fontSize: 13,
    lineHeight: 20,
  },
  label: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamilyStrong,
    fontSize: 10,
    textTransform: "uppercase",
  },
  mono: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamilyMono,
    fontSize: 11,
  } satisfies TextStyle,
});

const styles = StyleSheet.create({
  brandText: {
    fontFamily: installerTheme.fontFamily,
  },
  brandMark: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  brandMarkCompact: {
    gap: 7,
  },
  brandName: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamilyDisplayStrong,
    fontSize: 15,
    lineHeight: 17,
    letterSpacing: 0,
  },
  brandNameCompact: {
    fontSize: 12,
    lineHeight: 14,
  },
  brandProduct: {
    color: installerTheme.accent,
    fontFamily: installerTheme.fontFamilyStrong,
    fontSize: 8,
    lineHeight: 10,
    letterSpacing: 0,
  },
  brandProductCompact: {
    fontSize: 6,
    lineHeight: 8,
    letterSpacing: 0,
  },
  hero: {
    backgroundColor: installerTheme.background,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14,
  },
  heroTop: {
    zIndex: 1,
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  heroTopActionsOnly: {
    justifyContent: "flex-end",
    marginBottom: 12,
  },
  eyebrow: {
    zIndex: 1,
    color: installerTheme.textFaint,
    fontFamily: installerTheme.fontFamilyMedium,
    fontSize: 11,
    letterSpacing: 0,
    textTransform: "uppercase",
    marginBottom: 5,
  },
  heroTitle: {
    zIndex: 1,
    color: installerTheme.textOnDark,
    fontFamily: installerTheme.fontFamilyDisplayStrong,
    fontSize: 29,
    lineHeight: 35,
    flexShrink: 1,
  },
  heroSubtitle: {
    zIndex: 1,
    color: installerTheme.textFaint,
    fontFamily: installerTheme.fontFamily,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  card: {
    borderRadius: installerTheme.radius.xl,
    borderWidth: 1,
    borderColor: installerTheme.border,
    padding: 12,
    shadowColor: "#000000",
    shadowOpacity: 0.42,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
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
    fontFamily: installerTheme.fontFamilyStrong,
    fontSize: 13,
    flexShrink: 1,
  },
  counter: {
    backgroundColor: installerTheme.shellRaised,
    borderWidth: 1,
    borderColor: installerTheme.border,
    borderRadius: installerTheme.radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  counterText: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamilyMono,
    fontSize: 9,
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
    fontFamily: installerTheme.fontFamilyStrong,
    fontSize: 10,
    flexShrink: 1,
  },
  progressRingSvg: {
    transform: [{ rotate: "-90deg" }],
  },
  progressRingLabel: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  progressRingText: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamilyMono,
    fontSize: 10,
  },
  metric: {
    flex: 1,
    minWidth: 96,
    minHeight: 76,
    backgroundColor: installerTheme.shellRaised,
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    borderColor: installerTheme.border,
    borderStartWidth: 2,
    padding: 10,
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  metricLabel: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamilyMedium,
    fontSize: 9,
    textTransform: "uppercase",
  },
  metricValue: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamilyMono,
    fontSize: 19,
    marginTop: 4,
  },
  metricMeta: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamily,
    fontSize: 9,
    lineHeight: 12,
    marginTop: 2,
  },
  action: {
    position: "relative",
    overflow: "hidden",
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: installerTheme.radius.card,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  actionPrimary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: installerTheme.accent,
    shadowColor: installerTheme.accent,
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  actionGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  actionSecondary: {
    backgroundColor: installerTheme.shellRaised,
    borderWidth: 1,
    borderColor: installerTheme.borderStrong,
  },
  actionDanger: {
    backgroundColor: installerTheme.dangerSoft,
    borderWidth: 1,
    borderColor: installerTheme.dangerBorder,
  },
  actionDark: {
    backgroundColor: installerTheme.primarySoft,
    borderWidth: 1,
    borderColor: installerTheme.infoBorder,
  },
  actionPressed: {
    opacity: 0.72,
  },
  actionDisabled: {
    opacity: 0.42,
  },
  actionText: {
    fontFamily: installerTheme.fontFamilyStrong,
    fontSize: 12,
    textAlign: "center",
    flexShrink: 1,
  },
  actionTextWrap: {
    flexShrink: 1,
  },
  dialogRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  dialogBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(3,7,12,0.82)",
  },
  dialogPanel: {
    width: "100%",
    maxWidth: 420,
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    borderColor: installerTheme.borderStrong,
    backgroundColor: installerTheme.shellRaised,
    padding: 18,
    shadowColor: "#000000",
    shadowOpacity: 0.48,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14,
  },
  dialogIcon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: installerTheme.radius.pill,
    borderWidth: 1,
    borderColor: installerTheme.infoBorder,
    backgroundColor: installerTheme.infoSoft,
  },
  dialogIconDanger: {
    borderColor: installerTheme.dangerBorder,
    backgroundColor: installerTheme.dangerSoft,
  },
  dialogTitle: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamilyStrong,
    fontSize: 19,
    lineHeight: 24,
    marginTop: 14,
  },
  dialogMessage: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamily,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 7,
  },
  dialogActions: { flexDirection: "row", gap: 8, marginTop: 18 },
  dialogAction: { flex: 1 },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: installerTheme.radius.pill,
    borderWidth: 1,
    borderColor: installerTheme.border,
    backgroundColor: installerTheme.shellRaised,
  },
  iconButtonDark: {
    borderColor: installerTheme.shellBorder,
    backgroundColor: installerTheme.shellOverlay,
  },
  iconButtonAccent: {
    borderColor: installerTheme.accent,
    backgroundColor: installerTheme.accent,
  },
  segmented: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: installerTheme.shellRaised,
    borderWidth: 1,
    borderColor: installerTheme.border,
    borderRadius: installerTheme.radius.pill,
    padding: 3,
    gap: 3,
  },
  segmentedDark: {
    backgroundColor: installerTheme.shellOverlay,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: installerTheme.radius.pill,
    paddingHorizontal: 6,
  },
  segmentActiveDark: {
    backgroundColor: installerTheme.primarySoft,
    borderWidth: 1,
    borderColor: installerTheme.infoBorder,
  },
  segmentActiveAccent: {
    backgroundColor: installerTheme.accent,
  },
  segmentText: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamilyStrong,
    fontSize: 10,
    flexShrink: 1,
  },
  segmentTextDark: {
    color: installerTheme.textFaint,
  },
  segmentTextActive: {
    color: installerTheme.info,
  },
  segmentTextAccent: {
    color: installerTheme.textOnAccent,
  },
  segmentCount: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamilyStrong,
    fontSize: 8,
  },
  segmentCountActive: {
    color: installerTheme.text,
  },
  empty: {
    minHeight: 118,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  emptyIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: installerTheme.radius.pill,
    backgroundColor: installerTheme.shellRaised,
    borderWidth: 1,
    borderColor: installerTheme.border,
    marginBottom: 8,
  },
  emptyTitle: {
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamilyStrong,
    fontSize: 14,
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
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: installerTheme.border,
  },
  rowPressed: {
    backgroundColor: installerTheme.shellRaised,
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
    fontFamily: installerTheme.fontFamilyStrong,
    fontSize: 12,
  },
  rowSubtitle: {
    color: installerTheme.textMuted,
    fontFamily: installerTheme.fontFamily,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 2,
  },
  rowValue: {
    maxWidth: "54%",
    flexShrink: 1,
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamilyMono,
    fontSize: 11,
    textAlign: "right",
  },
});
