import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, View } from "react-native";
import { ActionButton, BrandText as Text, IconButton, SectionCard } from "@/components/mobile-ui";
import { Pop, Reveal } from "@/components/motion";
import { installerTheme } from "@/lib/theme";

/** The completion moment: what was finished, how much, and the way onward. */
export function CompletionCard({ title, summary, nextLabel, onNext, closeLabel, onClose, testID }: {
  title: string;
  summary: string;
  nextLabel?: string | null;
  onNext?: () => void;
  closeLabel: string;
  onClose: () => void;
  testID?: string;
}) {
  return (
    <Reveal tilt>
      <SectionCard style={styles.card}>
        <View style={styles.cardRow} testID={testID}>
          <Pop style={styles.cardMark}>
            <Ionicons name="trophy" size={22} color={installerTheme.textOnAccent} />
          </Pop>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.cardSummary}>{summary}</Text>
          </View>
          <IconButton icon="close" label={closeLabel} onPress={onClose} />
        </View>
        {nextLabel && onNext ? <ActionButton label={nextLabel} icon="arrow-forward" style={styles.cardAction} onPress={onNext} /> : null}
      </SectionCard>
    </Reveal>
  );
}

const styles = StyleSheet.create({
  card: { borderColor: installerTheme.accentEdge, gap: 12 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardMark: {
    width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: installerTheme.radius.pill,
    backgroundColor: installerTheme.accent, shadowColor: installerTheme.accent, shadowOpacity: 0.6, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 6,
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitle: { color: installerTheme.text, fontFamily: installerTheme.fontFamilyDisplay, fontSize: installerTheme.type.title, lineHeight: 22 },
  cardSummary: { color: installerTheme.textMuted, fontSize: installerTheme.type.meta, lineHeight: 18, marginTop: 2 },
  cardAction: { marginTop: 2 },
});
