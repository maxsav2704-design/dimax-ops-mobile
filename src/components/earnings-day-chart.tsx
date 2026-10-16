import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { FeedbackPressable as Pressable } from "@/components/feedback-pressable";
import { BrandText as Text } from "@/components/mobile-ui";
import { installerTheme } from "@/lib/theme";
import { sumEarningsValues } from "@/modules/earnings/decimal";

export type EarningsDayBar = { date: string; amount: number; rows: number };

const TRACK_HEIGHT = 72;
const MIN_FILL = 3;

/** Groups recorded work by day, oldest first; amounts stay the server's recorded values. */
export function buildEarningsDayChart(rows: ReadonlyArray<{ work_date: string; amount: string | number }>): EarningsDayBar[] {
  const lanes = new Map<string, EarningsDayBar>();
  for (const row of rows) {
    const current = lanes.get(row.work_date) || { date: row.work_date, amount: 0, rows: 0 };
    current.amount = sumEarningsValues([current.amount, row.amount]);
    current.rows += 1;
    lanes.set(row.work_date, current);
  }
  return Array.from(lanes.values()).sort((left, right) => left.date.localeCompare(right.date));
}

export function EarningsDayChart({ bars, selectedDate, today, dateLabel, money, onSelect, testID }: {
  bars: EarningsDayBar[];
  selectedDate: string | null;
  today: string;
  dateLabel: (date: string) => string;
  money: (amount: number) => string;
  onSelect: (date: string) => void;
  testID: string;
}) {
  const peak = Math.max(1, ...bars.map((bar) => Math.abs(bar.amount)));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} testID={testID}>
      {bars.map((bar) => {
        const selected = bar.date === selectedDate;
        const fill = Math.max(MIN_FILL, Math.round((Math.abs(bar.amount) / peak) * TRACK_HEIGHT));
        const color = bar.amount < 0
          ? installerTheme.danger
          : selected
            ? installerTheme.accent
            : bar.date === today
              ? installerTheme.info
              : installerTheme.success;
        return (
          <Pressable
            key={bar.date}
            testID={`${testID}-${bar.date}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${dateLabel(bar.date)}. ${money(bar.amount)}`}
            onPress={() => onSelect(bar.date)}
            style={[styles.column, selected && styles.columnSelected]}
          >
            <Text style={[styles.amount, selected && styles.amountSelected]} numberOfLines={1}>{selected ? money(bar.amount) : " "}</Text>
            <View style={styles.track}>
              <View style={[styles.fill, { height: fill, backgroundColor: color }, selected && styles.fillSelected]} />
            </View>
            <Text style={[styles.day, selected && styles.daySelected]}>{bar.date.slice(8, 10)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: "row", alignItems: "flex-end", gap: 6, paddingTop: 4, paddingBottom: 2 },
  column: { width: 44, alignItems: "center", gap: 4, paddingVertical: 4, borderRadius: installerTheme.radius.sm, borderWidth: 1, borderColor: "transparent" },
  columnSelected: { borderColor: installerTheme.accentEdge, backgroundColor: installerTheme.accentWarm },
  amount: { minHeight: 16, color: installerTheme.textFaint, fontFamily: installerTheme.fontFamilyMono, fontSize: installerTheme.type.caption, lineHeight: 16 },
  amountSelected: { color: installerTheme.accentText },
  track: { height: TRACK_HEIGHT, width: 18, justifyContent: "flex-end", borderRadius: 4, overflow: "hidden", backgroundColor: installerTheme.shellOverlaySubtle },
  fill: { width: "100%", borderRadius: 4, opacity: 0.85 },
  fillSelected: { opacity: 1 },
  day: { color: installerTheme.textMuted, fontFamily: installerTheme.fontFamilyStrong, fontSize: installerTheme.type.caption, lineHeight: 16 },
  daySelected: { color: installerTheme.text },
});
