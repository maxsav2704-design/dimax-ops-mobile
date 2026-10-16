import React from "react";
import { StyleSheet, View } from "react-native";
import { FeedbackPressable as Pressable } from "@/components/feedback-pressable";
import { BrandText as Text } from "@/components/mobile-ui";
import { translateEnum } from "@/lib/i18n";
import { installerTheme } from "@/lib/theme";
import type { InstallerDoor } from "@/modules/projects/types";
import { doorStatusColors } from "@/modules/projects/ui/door-presentation";

type Locale = "en" | "ru" | "he";
type FloorGroup = [string, InstallerDoor[]];

const TILE = 18;
const GOLD = installerTheme.accent;

/**
 * Isometric floor map: one row per floor, one thin-lined tile per door, lit by status.
 * Tiles are flat diamonds with a dark underside, so the grid reads as a model, not a legend.
 */
export function FloorHeatmap({ floors, selectedDoorId, issueDoorIds, busy, locale, onOpenDoor, testID }: {
  floors: FloorGroup[];
  selectedDoorId: string;
  issueDoorIds: Set<string>;
  busy: boolean;
  locale: Locale;
  onOpenDoor: (doorId: string) => void;
  testID?: string;
}) {
  return (
    <View style={styles.map} testID={testID}>
      {floors.map(([floor, doors]) => (
        <View key={floor} style={styles.row}>
          <Text style={styles.floorLabel} numberOfLines={1}>{floor}</Text>
          <View style={styles.tiles}>
            {doors.map((door) => {
              const hasIssue = issueDoorIds.has(door.id);
              const colors = doorStatusColors(door, hasIssue);
              const selected = door.id === selectedDoorId;
              return (
                <Pressable
                  key={door.id}
                  testID={testID ? `${testID}-${door.id}` : undefined}
                  accessibilityRole="imagebutton"
                  accessibilityLabel={`${door.unit_label}, ${translateEnum(locale, hasIssue ? "ISSUE_OPEN" : door.status)}`}
                  accessibilityState={{ selected }}
                  disabled={busy}
                  hitSlop={6}
                  onPress={() => onOpenDoor(door.id)}
                  style={styles.cell}
                >
                  <View style={[styles.under, { borderColor: colors.text }]} />
                  <View
                    style={[
                      styles.tile,
                      { backgroundColor: colors.background, borderColor: selected ? GOLD : colors.text, shadowColor: colors.text },
                      selected && styles.tileSelected,
                    ]}
                  >
                    {hasIssue ? <View style={styles.issueDot} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const ISO = [{ rotateX: "58deg" }, { rotateZ: "45deg" }];

const styles = StyleSheet.create({
  map: { gap: 6, paddingVertical: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: TILE + 8 },
  floorLabel: { width: 28, color: installerTheme.textMuted, fontFamily: installerTheme.fontFamilyMono, fontSize: installerTheme.type.caption, textAlign: "center" },
  tiles: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 9, paddingVertical: 2 },
  cell: { width: TILE + 6, height: TILE + 4, alignItems: "center", justifyContent: "center" },
  under: { position: "absolute", width: TILE, height: TILE, top: 4, borderWidth: 1, borderColor: "transparent", backgroundColor: "rgba(0,0,0,0.6)", transform: ISO },
  tile: {
    width: TILE, height: TILE, borderWidth: 1, transform: ISO, alignItems: "center", justifyContent: "center",
    shadowOpacity: 0.55, shadowRadius: 5, shadowOffset: { width: 0, height: 0 },
  },
  tileSelected: { borderWidth: 2, shadowOpacity: 1, shadowRadius: 9, elevation: 4 },
  issueDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: installerTheme.dangerFill },
});
