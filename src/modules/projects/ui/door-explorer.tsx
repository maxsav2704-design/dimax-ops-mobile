import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { DirectionalChevron } from "@/components/directional-chevron";
import { FeedbackPressable as Pressable } from "@/components/feedback-pressable";
import { ActionButton, AnimatedNumber, BrandText as Text, EmptyState, SectionCard, SectionHeader } from "@/components/mobile-ui";
import { Pulse, Reveal } from "@/components/motion";
import { TickBar } from "@/components/tick-bar";
import { translateEnum } from "@/lib/i18n";
import { installerTheme, toneColors, type InstallerTone } from "@/lib/theme";
import { breakableUnitLabel, buildDoorPositionLabel, doorStatusColors, doorStatusIcon, formatIssueCount } from "@/modules/projects/ui/door-presentation";
import type { DoorTypeOption, InstallerDoor } from "@/modules/projects/types";

type Locale = "en" | "ru" | "he";
type FloorGroup = [string, InstallerDoor[]];

/** Floor navigator plus per-floor door lists; selection and filters stay in the screen. */
export function DoorExplorer({
  lt, locale, filteredCount, totalCount, groupedDoors, displayedFloorGroups, focusedFloor, onFocusFloor,
  selectedDoorId, celebrateDoorId, busy, issueDoorIds, doorTypes, onOpenDoor, onResetFilters,
}: {
  lt: (en: string, ru: string, he: string) => string;
  locale: Locale;
  filteredCount: number;
  totalCount: number;
  groupedDoors: FloorGroup[];
  displayedFloorGroups: FloorGroup[];
  focusedFloor: string;
  onFocusFloor: (floor: string, firstDoorId?: string) => void;
  selectedDoorId: string;
  celebrateDoorId: string | null;
  busy: boolean;
  issueDoorIds: Set<string>;
  doorTypes: DoorTypeOption[];
  onOpenDoor: (doorId: string) => void;
  onResetFilters: () => void;
}) {
  return (
    <View style={styles.floorSection}>
      <SectionHeader title={lt("Doors by floor", "Двери по этажам", "דלתות לפי קומה")} meta={`${filteredCount}/${totalCount}`} />
      {groupedDoors.length ? (
        <View style={styles.explorerLayout}>
          <View
            style={[
              styles.floorShaft,
              { height: Math.min(520, Math.max(146, 100 + groupedDoors.length * 46)) },
            ]}
          >
            <View pointerEvents="none" style={styles.floorShaftLine} />
            <ScrollView
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.floorNavigator}
            >
              <Pressable
                accessibilityRole="tab"
                disabled={busy}
                accessibilityState={{ selected: focusedFloor === "ALL" }}
                accessibilityLabel={lt("Show all floors", "Показать все этажи", "הצגת כל הקומות")}
                onPress={() => onFocusFloor("ALL")}
                style={[styles.floorNavItem, focusedFloor === "ALL" && styles.floorNavItemActive]}
              >
                <Ionicons
                  name="layers-outline"
                  size={15}
                  color={focusedFloor === "ALL" ? installerTheme.info : installerTheme.textMuted}
                />
              </Pressable>
              {groupedDoors.map(([floor, floorDoors]) => {
                const active = focusedFloor === floor;
                const issueCount = floorDoors.filter((door) => issueDoorIds.has(door.id)).length;
                return (
                  <Pressable
                    key={floor}
                    accessibilityRole="tab"
                    disabled={busy}
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${lt("Floor", "Этаж", "קומה")} ${floor}. ${lt("Doors", "Двери", "דלתות")}: ${floorDoors.length}${issueCount ? `. ${formatIssueCount(locale, issueCount)}` : ""}`}
                    onPress={() => onFocusFloor(floor, floorDoors[0]?.id || "")}
                    style={[styles.floorNavItem, active && styles.floorNavItemActive]}
                  >
                    <Text style={[styles.floorNavLabel, active && styles.floorNavLabelActive]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{floor}</Text>
                    {issueCount ? <View style={styles.floorNavIssue} /> : null}
                    {active ? <View style={styles.floorNavActiveRail} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.floorList}>
            {displayedFloorGroups.map(([floor, floorDoors], floorIndex) => {
              const floorInstalled = floorDoors.filter((door) => door.status === "INSTALLED").length;
              const floorIssues = floorDoors.filter((door) => issueDoorIds.has(door.id)).length;
              const floorProgress = floorDoors.filter((door) => door.status === "IN_PROGRESS").length;
              const floorPercent = Math.round((floorInstalled / floorDoors.length) * 100);
              return (
                <Reveal key={floor} index={floorIndex} tilt>
                <SectionCard style={styles.floorCard}>
                  <View style={styles.floorHeader}>
                    <View style={styles.floorHeading}>
                      <Text style={styles.floorTitle}>{lt("Floor", "Этаж", "קומה")} {floor}</Text>
                      <Text style={styles.floorMeta}>{`${lt("Doors", "Двери", "דלתות")}: ${floorDoors.length}`}</Text>
                    </View>
                    <AnimatedNumber value={floorPercent} format={(current) => `${Math.round(current)}%`} style={styles.floorPercent} />
                  </View>
                  <View style={styles.floorProgressRow}>
                    <TickBar
                      total={floorDoors.length}
                      filled={floorInstalled}
                      color={floorIssues ? installerTheme.warning : installerTheme.success}
                      testID={`floor-progress-${floor}`}
                    />
                    <Text style={styles.floorProgressText}>
                      {floorInstalled}/{floorDoors.length}
                    </Text>
                  </View>
                  <View style={styles.floorSummaryRow}>
                    <FloorSummary tone="success" value={floorInstalled} label={lt("Installed", "Установлено", "הותקנו")} />
                    <FloorSummary tone="info" value={floorProgress} label={lt("In progress", "В работе", "בתהליך")} />
                    <FloorSummary tone={floorIssues ? "warning" : "neutral"} value={floorIssues} label={lt("Issues", "Проблемы", "תקלות")} />
                  </View>
                  <View style={styles.doorList}>
                    {floorDoors.map((door, doorIndex) => (
                      <Reveal key={door.id} index={doorIndex} tilt>
                      <DoorExplorerRow
                        door={door}
                        typeLabel={doorTypes.find((doorType) => doorType.id === door.door_type_id)?.name || door.door_type_id}
                        positionLabel={buildDoorPositionLabel(door, locale)}
                        selected={door.id === selectedDoorId}
                        celebrate={door.status === "INSTALLED" && door.id === celebrateDoorId}
                        disabled={busy}
                        hasIssue={issueDoorIds.has(door.id)}
                        locale={locale}
                        onPress={() => onOpenDoor(door.id)}
                      />
                      </Reveal>
                    ))}
                  </View>
                </SectionCard>
                </Reveal>
              );
            })}
          </View>
        </View>
      ) : (
        <SectionCard>
          <EmptyState
            icon="search-outline"
            title={lt("No matching doors", "Двери не найдены", "לא נמצאו דלתות")}
            action={<ActionButton label={lt("Reset filters", "Сбросить фильтры", "איפוס מסננים")} variant="secondary" onPress={onResetFilters} />}
          />
        </SectionCard>
      )}
    </View>
  );
}

function FloorSummary({
  tone,
  value,
  label,
}: {
  tone: InstallerTone;
  value: number;
  label: string;
}) {
  const colors = toneColors(tone);
  return (
    <View style={[styles.floorSummary, { borderColor: colors.border, backgroundColor: colors.background }]}>
      <View style={[styles.floorSummaryDot, { backgroundColor: colors.text }]} />
      <Text style={[styles.floorSummaryValue, { color: colors.text }]}>{value}</Text>
      <Text style={styles.floorSummaryLabel} numberOfLines={2}>{label}</Text>
    </View>
  );
}

function DoorExplorerRow({
  door,
  typeLabel,
  positionLabel,
  selected,
  celebrate,
  disabled,
  hasIssue,
  locale,
  onPress,
}: {
  door: InstallerDoor;
  typeLabel: string;
  positionLabel: string;
  selected: boolean;
  celebrate: boolean;
  disabled: boolean;
  hasIssue: boolean;
  locale: "en" | "ru" | "he";
  onPress: () => void;
}) {
  const colors = doorStatusColors(door, hasIssue);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      disabled={disabled}
      accessibilityLabel={`${door.unit_label}, ${positionLabel}, ${translateEnum(locale, door.status)}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.doorExplorerRow,
        selected && styles.doorExplorerRowSelected,
        pressed && styles.doorTilePressed,
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          styles.doorExplorerAccent,
          { backgroundColor: colors.text },
          selected && styles.doorExplorerAccentSelected,
        ]}
      />
      <View style={[styles.doorThumb, { borderColor: colors.border, shadowColor: colors.text }]}>
        <LinearGradient colors={["#45566B", installerTheme.doorMaterial, "#111B26"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.8 }} style={[styles.doorThumbLeaf, { borderColor: colors.text }]}>
          <View style={styles.doorThumbInset} />
          <View style={[styles.doorThumbHandle, { backgroundColor: installerTheme.accent }]} />
        </LinearGradient>
        <View style={[styles.doorThumbStatus, { backgroundColor: colors.text }]} />
      </View>
      <View style={styles.doorExplorerBody}>
        <Text style={styles.doorExplorerNumber}>{breakableUnitLabel(door.unit_label)}</Text>
        <Text style={styles.doorExplorerType}>{typeLabel}</Text>
        <View style={styles.doorExplorerMetaRow}>
          <Ionicons
            name="location-outline"
            size={13}
            color={installerTheme.textMuted}
          />
          <Text style={styles.doorExplorerMeta}>{positionLabel}</Text>
        </View>
        <View style={styles.doorExplorerState}>
          <Pulse trigger={celebrate} color={colors.text} style={styles.doorExplorerStateIcon}>
            <Ionicons name={doorStatusIcon(door, hasIssue)} size={14} color={colors.text} />
          </Pulse>
          <Text style={[styles.doorExplorerStatus, { color: colors.text }]}>{translateEnum(locale, hasIssue ? "ISSUE_OPEN" : door.status)}</Text>
        </View>
      </View>
      <DirectionalChevron size={16} color={selected ? installerTheme.info : installerTheme.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  floorSection: { gap: 10 },
  explorerLayout: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  floorShaft: {
    position: "relative",
    width: 54,
    overflow: "hidden",
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    borderColor: installerTheme.border,
    backgroundColor: "rgba(19,24,33,0.82)",
  },
  floorShaftLine: {
    position: "absolute",
    top: 14,
    bottom: 14,
    start: 26,
    width: 1,
    backgroundColor: installerTheme.infoBorder,
  },
  floorNavigator: { alignItems: "center", gap: 4, paddingVertical: 15 },
  floorNavItem: {
    position: "relative",
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "rgba(8,14,21,0.72)",
  },
  floorNavItemActive: {
    transform: [{ scale: 1.05 }],
    borderColor: installerTheme.primary,
    backgroundColor: installerTheme.primarySoft,
    shadowColor: installerTheme.info,
    shadowOpacity: 0.58,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  floorNavLabel: { color: installerTheme.textMuted, fontFamily: installerTheme.fontFamilyMono, fontSize: 13, textAlign: "center", paddingHorizontal: 2 },
  floorNavLabelActive: { color: installerTheme.info },
  floorNavIssue: {
    position: "absolute",
    top: 4,
    end: 4,
    width: 6,
    height: 6,
    borderRadius: installerTheme.radius.pill,
    backgroundColor: installerTheme.danger,
    shadowColor: installerTheme.danger,
    shadowOpacity: 0.8,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
  floorNavActiveRail: {
    position: "absolute",
    end: -8,
    width: 8,
    height: 3,
    borderRadius: installerTheme.radius.pill,
    backgroundColor: installerTheme.info,
    shadowColor: installerTheme.info,
    shadowOpacity: 1,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
  },
  floorList: { flex: 1, minWidth: 0, gap: 12 },
  floorCard: {
    padding: 0,
    overflow: "hidden",
    borderRadius: installerTheme.radius.glass,
  },
  floorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 13,
    paddingTop: 13,
    paddingBottom: 10,
  },
  floorHeading: { flex: 1, minWidth: 0 },
  floorTitle: { color: installerTheme.text, fontFamily: installerTheme.fontFamilyDisplay, fontSize: 18 },
  floorMeta: { color: installerTheme.textMuted, fontSize: 12, marginTop: 3 },
  floorPercent: { color: installerTheme.info, fontFamily: installerTheme.fontFamilyMono, fontSize: 12 },
  floorProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  floorSummaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 12, paddingBottom: 12 },
  floorSummary: {
    maxWidth: "100%",
    minWidth: 0,
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  floorSummaryDot: { width: 5, height: 5, borderRadius: 3 },
  floorSummaryValue: { fontFamily: installerTheme.fontFamilyMono, fontSize: 12 },
  floorSummaryLabel: { flexShrink: 1, color: installerTheme.textMuted, fontSize: installerTheme.type.caption, lineHeight: 16 },
  doorList: { borderTopWidth: 1, borderTopColor: installerTheme.border },
  doorExplorerRow: {
    position: "relative",
    overflow: "hidden",
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 10,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: installerTheme.border,
  },
  doorExplorerRowSelected: { backgroundColor: installerTheme.primarySoft, borderColor: installerTheme.infoBorder },
  doorExplorerAccent: {
    position: "absolute",
    top: 10,
    bottom: 10,
    start: 0,
    width: 2,
    opacity: 0.45,
  },
  doorExplorerAccentSelected: {
    width: 3,
    opacity: 1,
  },
  doorThumb: {
    position: "relative",
    width: 40,
    height: 56,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: installerTheme.background,
    shadowOpacity: 0.28,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  doorThumbLeaf: {
    position: "relative",
    width: 26,
    height: 40,
    borderRadius: 3,
    borderWidth: 1,
    backgroundColor: installerTheme.doorMaterial,
    padding: 3,
  },
  doorThumbInset: { flex: 1, borderRadius: 2, borderWidth: 1, borderColor: installerTheme.doorMaterialInset },
  doorThumbHandle: { position: "absolute", end: 3, top: 19, width: 3, height: 3, borderRadius: 2 },
  doorThumbStatus: { position: "absolute", start: 0, end: 0, bottom: 0, height: 3 },
  doorExplorerBody: { flex: 1, minWidth: 0 },
  doorExplorerNumber: { color: installerTheme.text, fontFamily: installerTheme.fontFamilyDisplay, fontSize: 15, lineHeight: 21 },
  doorExplorerType: { color: installerTheme.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  doorExplorerMetaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5 },
  doorExplorerMeta: { flex: 1, minWidth: 0, color: installerTheme.textMuted, fontSize: 12, lineHeight: 17 },
  doorExplorerState: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  doorExplorerStateIcon: { width: 18, height: 18, alignItems: "center", justifyContent: "center", borderRadius: installerTheme.radius.pill },
  doorExplorerStatus: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 17, fontWeight: "700" },
  floorProgressText: { color: installerTheme.textMuted, fontFamily: installerTheme.fontFamilyMono, fontSize: installerTheme.type.caption },
  doorTilePressed: { opacity: 0.94 },
});
