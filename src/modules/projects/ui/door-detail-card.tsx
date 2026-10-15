import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, TextInput, View } from "react-native";
import { chevronIcon } from "@/components/directional-chevron";
import { DoorGlyph } from "@/components/door-glyph";
import { ActionButton, BrandText as Text, IconButton, SectionCard, SectionHeader, StatusPill } from "@/components/mobile-ui";
import { Reveal } from "@/components/motion";
import { isRtlLocale, translateEnum } from "@/lib/i18n";
import { installerTheme } from "@/lib/theme";
import type { WorkPricePresentation } from "@/modules/prices/presentation";
import { WorkPriceReadout } from "@/modules/prices/WorkPriceReadout";
import type { DoorActionState } from "@/modules/projects/door-action-state";
import type { LocalProjectWorkspace } from "@/modules/projects/local-workspace";
import type { DoorTypeOption, InstallerDoor, ProjectIssue } from "@/modules/projects/types";
import { FilterChip } from "@/modules/projects/ui/filter-chip";
import { breakableUnitLabel, doorStatusColors, doorStatusIcon, doorStatusTone, formatIssueCount } from "@/modules/projects/ui/door-presentation";
import type { PendingSyncEvent } from "@/modules/sync/types";

type Locale = "en" | "ru" | "he";
type InstallerReason = LocalProjectWorkspace["reasons"][number];

/** Selected door: hero, facts, price, issues, field actions and the walkthrough link. All state lives in the screen. */
export function DoorDetailCard({
  door, doorType, issues, pendingEvents, doorPrice, doorActionState, lt, locale, projectId, busy, activeAction,
  showNotInstalledForm, setShowNotInstalledForm, reasons, selectedReasonId, setSelectedReasonId, selectedReason,
  doorComment, setDoorComment, onInstall, onNotInstalled, onBackToList, onOpenDoor, nextDoor, doorsLeftInView,
  feedback, formatDateTime,
}: {
  door: InstallerDoor;
  doorType: DoorTypeOption | null;
  issues: ProjectIssue[];
  pendingEvents: PendingSyncEvent[];
  doorPrice: WorkPricePresentation | null;
  doorActionState: DoorActionState | null;
  lt: (en: string, ru: string, he: string) => string;
  locale: Locale;
  projectId: string;
  busy: boolean;
  activeAction: string | null;
  showNotInstalledForm: boolean;
  setShowNotInstalledForm: (value: boolean) => void;
  reasons: InstallerReason[];
  selectedReasonId: string;
  setSelectedReasonId: (value: string) => void;
  selectedReason: InstallerReason | null;
  doorComment: string;
  setDoorComment: (value: string) => void;
  onInstall: () => void;
  onNotInstalled: () => void;
  onBackToList: () => void;
  onOpenDoor: (doorId: string) => void;
  nextDoor: InstallerDoor | null;
  doorsLeftInView: number;
  feedback: React.ReactNode;
  formatDateTime: (value: string | null) => string;
}) {
  return (
    <SectionCard style={styles.doorDetail}>
      <SectionHeader
        title={lt("Door details", "Карточка двери", "פרטי דלת")}
        action={<IconButton icon="list-outline" label={lt("Back to doors", "К списку дверей", "חזרה לדלתות")} onPress={onBackToList} />}
      />
      <View style={[styles.doorDetailStrip, { backgroundColor: doorStatusColors(door, issues.length > 0).text }]} />
      <Reveal key={door.id} style={styles.doorImageHero}>
        <LinearGradient
          pointerEvents="none"
          colors={[installerTheme.shellRaised, installerTheme.shell]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View pointerEvents="none" style={styles.doorHeroGlyph}>
          <DoorGlyph
            width={104}
            tone={doorStatusColors(door, issues.length > 0)}
            hasIssue={issues.length > 0}
            icon={doorStatusIcon(door, issues.length > 0)}
          />
        </View>
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(8,14,21,0.04)", "rgba(8,14,21,0.46)", installerTheme.background]}
          locations={[0, 0.48, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.doorImageContent}>
          <Text style={styles.doorEyebrow}>{lt("Selected position", "Выбранная позиция", "מיקום נבחר")}</Text>
          <View style={styles.doorImageTitleRow}>
            <View style={styles.doorHeroBody}>
              <Text style={styles.doorNumber}>
                {breakableUnitLabel(door.unit_label)}
              </Text>
              <Text style={styles.doorType}>
                {doorType?.name || doorType?.code || door.door_type_id}
              </Text>
            </View>
            <StatusPill
              label={translateEnum(locale, issues.length ? "ISSUE_OPEN" : door.status)}
              tone={doorStatusTone(door, issues.length > 0)}
            />
          </View>
          <View style={styles.doorBadges}>
            {issues.length ? <StatusPill label={formatIssueCount(locale, issues.length)} tone="danger" /> : null}
            {pendingEvents.length ? (
              <StatusPill
                label={`${pendingEvents.length} ${lt("queued", "в очереди", "בתור")}`}
                tone={pendingEvents.some((event) => event.status !== "PENDING") ? "danger" : "warning"}
                icon="cloud-upload-outline"
              />
            ) : null}
          </View>
        </View>
      </Reveal>

      <View style={styles.doorFacts}>
        <DoorFact label={lt("Order", "Заказ", "הזמנה")} value={door.order_number} />
        <DoorFact label={lt("Floor", "Этаж", "קומה")} value={door.floor_label} />
        <DoorFact label={lt("Apartment", "Квартира", "דירה")} value={door.apartment_number} />
        <DoorFact label={lt("Marking", "Маркировка", "סימון")} value={door.door_marking} />
        <DoorFact label={lt("Location", "Локация", "מיקום")} value={door.location_code} />
        <DoorFact label={lt("Version", "Версия", "גרסה")} value={String(door.version)} />
      </View>

      {doorPrice ? <WorkPriceReadout testID="door-work-price" price={doorPrice} busy={busy}
        onOpen={() => router.push((doorPrice.link === "queue" ? "/sync-queue"
          : `/earnings?project_id=${encodeURIComponent(projectId)}`) as never)} /> : null}

      {issues.map((issue) => (
        <View key={issue.id} style={styles.selectedIssue}>
          <Ionicons name="alert-circle-outline" size={18} color={installerTheme.danger} />
          <View style={styles.selectedIssueBody}>
            <Text style={styles.selectedIssueTitle}>{issue.title || lt("Door issue", "Проблема двери", "תקלה בדלת")}</Text>
            {issue.details ? <Text style={styles.selectedIssueText}>{issue.details}</Text> : null}
          </View>
        </View>
      ))}

      {doorActionState?.isLocked ? (
        <View style={styles.lockedBox}>
          <Ionicons name="lock-closed-outline" size={18} color={installerTheme.textMuted} />
          <Text style={styles.lockedText}>
            {lt("This door is locked after completion.", "Дверь заблокирована после завершения.", "הדלת נעולה לאחר השלמה.")}
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.doorActionDeck}>
            <View style={styles.actionDeckHeader}>
              <View style={styles.actionDeckIcon}>
                <Ionicons name="construct-outline" size={18} color={installerTheme.info} />
              </View>
              <View style={styles.actionDeckHeading}>
                <Text style={styles.actionDeckEyebrow}>{lt("FIELD UPDATE", "ПОЛЕВОЙ СТАТУС", "עדכון שטח")}</Text>
                <Text style={styles.actionDeckTitle}>{lt("Record the result", "Зафиксировать результат", "תיעוד התוצאה")}</Text>
              </View>
              <View style={styles.offlineReady}>
                <View style={styles.offlineReadyDot} />
                <Text style={styles.offlineReadyText}>{lt("OFFLINE", "ОФЛАЙН", "לא מקוון")}</Text>
              </View>
            </View>
            <View style={styles.doorActions}>
              <ActionButton
                label={lt("Installed", "Установлено", "הותקנה")}
                icon="checkmark"
                loading={activeAction === "door"}
                disabled={!doorActionState?.canMarkInstalled}
                style={styles.actionButtonSlot}
                onPress={onInstall}
              />
              <ActionButton
                label={lt("Not installed", "Не установлено", "לא הותקנה")}
                icon="close"
                variant="secondary"
                disabled={!doorActionState?.canMarkNotInstalled}
                style={styles.actionButtonSlot}
                onPress={() => setShowNotInstalledForm(true)}
              />
            </View>
          </View>

          {showNotInstalledForm ? (
            <View style={styles.notInstalledPanel}>
              <View style={styles.notInstalledHeader}>
                <View style={styles.notInstalledHeading}>
                  <Text style={styles.notInstalledTitle}>{lt("Why was it not installed?", "Почему дверь не установлена?", "מדוע הדלת לא הותקנה?")}</Text>
                  <Text style={styles.notInstalledMeta}>{door.unit_label}</Text>
                </View>
                <IconButton
                  icon="close"
                  label={lt("Close reason form", "Закрыть выбор причины", "סגירת בחירת סיבה")}
                  disabled={busy}
                  onPress={() => setShowNotInstalledForm(false)}
                />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {reasons.map((reason) => (
                  <FilterChip
                    key={reason.id}
                    active={selectedReasonId === reason.id}
                    disabled={busy}
                    label={reason.name || reason.code}
                    onPress={() => setSelectedReasonId(reason.id)}
                  />
                ))}
              </ScrollView>
              {selectedReason ? <Text style={styles.reasonCode}>{selectedReason.code}</Text> : null}
              <TextInput
                value={doorComment}
                editable={!busy}
                onChangeText={setDoorComment}
                accessibilityLabel={lt("Door comment", "Комментарий по двери", "הערה לדלת")}
                placeholder={lt("Comment for the office…", "Комментарий для офиса…", "הערה למשרד…")}
                placeholderTextColor={installerTheme.textFaint}
                multiline
                maxLength={1000}
                style={[styles.input, styles.textarea]}
              />
            <ActionButton
              label={lt("Confirm not installed", "Подтвердить: не установлено", "אישור: לא הותקנה")}
              icon="checkmark-circle-outline"
              variant="danger"
              loading={activeAction === "door"}
              disabled={!doorActionState?.canMarkNotInstalled}
              onPress={onNotInstalled}
            />
            </View>
          ) : null}
        </>
      )}
      {feedback}
      {nextDoor ? (
        <ActionButton
          testID="project-next-door"
          label={`${lt("Next door", "Следующая дверь", "הדלת הבאה")}: ${nextDoor.unit_label} · ${lt(`${doorsLeftInView} left`, `осталось ${doorsLeftInView}`, `נותרו ${doorsLeftInView}`)}`}
          icon={chevronIcon(isRtlLocale(locale), "forward")}
          variant="secondary"
          disabled={busy}
          style={styles.reportButton}
          onPress={() => onOpenDoor(nextDoor.id)}
        />
      ) : null}
      <ActionButton
        label={lt("Report issue for this door", "Сообщить о проблеме двери", "דיווח תקלה בדלת")}
        icon="alert-circle-outline"
        variant="danger"
        style={styles.reportButton}
        onPress={() =>
          router.push(`/issues?projectId=${encodeURIComponent(projectId)}&doorId=${encodeURIComponent(door.id)}&compose=1` as never)
        }
      />
      <Text style={styles.updatedText}>
        {lt("Last local update", "Последнее локальное обновление", "עדכון מקומי אחרון")}: {formatDateTime(door.updated_at)}
      </Text>
    </SectionCard>
  );
}

function DoorFact({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={styles.doorFact}>
      <Text style={styles.doorFactLabel}>{label}</Text>
      <Text style={styles.doorFactValue} numberOfLines={1}>{value || "—"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 44,
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    borderColor: installerTheme.border,
    backgroundColor: installerTheme.shellRaised,
    color: installerTheme.text,
    fontFamily: installerTheme.fontFamily,
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
  },
  textarea: { minHeight: 86, textAlignVertical: "top" },
  chips: { gap: 7, paddingEnd: 12, marginTop: 9 },
  doorDetail: {
    position: "relative",
    overflow: "hidden",
    paddingStart: 16,
    borderColor: installerTheme.borderStrong,
    backgroundColor: installerTheme.shellRaised,
  },
  doorDetailStrip: { position: "absolute", top: 0, bottom: 0, start: 0, width: 4 },
  doorImageHero: {
    position: "relative",
    minHeight: 240,
    justifyContent: "flex-end",
    overflow: "hidden",
    borderRadius: installerTheme.radius.card,
    borderWidth: 1,
    borderColor: installerTheme.border,
  },
  doorHeroGlyph: { position: "absolute", top: 22, end: 22 },
  doorImageContent: {
    paddingHorizontal: 14,
    // Clears the 104px door glyph (top 22) so long unit labels never run under it.
    paddingTop: 164,
    paddingBottom: 13,
  },
  doorImageTitleRow: { alignItems: "flex-start", gap: 10, marginTop: 4 },
  doorHeroBody: { width: "100%", minWidth: 0 },
  doorEyebrow: { color: installerTheme.textMuted, fontFamily: installerTheme.fontFamilyMedium, fontSize: installerTheme.type.caption, letterSpacing: 0, textTransform: "uppercase" },
  doorNumber: { color: installerTheme.text, fontFamily: installerTheme.fontFamilyDisplayStrong, fontSize: 22, lineHeight: 29 },
  doorType: { color: installerTheme.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  doorBadges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 7 },
  doorFacts: { flexDirection: "row", flexWrap: "wrap", gap: 1, overflow: "hidden", borderRadius: installerTheme.radius.card, backgroundColor: installerTheme.border, marginTop: 13 },
  doorFact: { width: "33%", flexGrow: 1, minWidth: 90, backgroundColor: installerTheme.card, padding: 9 },
  doorFactLabel: { color: installerTheme.textMuted, fontSize: installerTheme.type.caption, fontWeight: "700", textTransform: "uppercase" },
  doorFactValue: { color: installerTheme.text, fontSize: installerTheme.type.caption, fontWeight: "800", marginTop: 3 },
  selectedIssue: { flexDirection: "row", gap: 9, borderRadius: installerTheme.radius.card, borderWidth: 1, borderColor: installerTheme.dangerBorder, backgroundColor: installerTheme.dangerSoft, padding: 10, marginTop: 11 },
  selectedIssueBody: { flex: 1, minWidth: 0 },
  selectedIssueTitle: { color: installerTheme.danger, fontSize: installerTheme.type.caption, fontWeight: "800" },
  selectedIssueText: { color: installerTheme.text, fontSize: installerTheme.type.caption, lineHeight: 15, marginTop: 3 },
  lockedBox: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: installerTheme.radius.card, borderWidth: 1, borderColor: installerTheme.border, backgroundColor: installerTheme.card, padding: 11, marginTop: 12 },
  lockedText: { flex: 1, color: installerTheme.textMuted, fontSize: installerTheme.type.caption, lineHeight: 15 },
  doorActionDeck: {
    borderTopWidth: 1,
    borderTopColor: installerTheme.shellBorderSoft,
    marginTop: 13,
    paddingTop: 12,
  },
  actionDeckHeader: { flexDirection: "row", alignItems: "center", gap: 9 },
  actionDeckIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: installerTheme.radius.md,
    borderWidth: 1,
    borderColor: installerTheme.infoBorder,
    backgroundColor: installerTheme.primarySoft,
  },
  actionDeckHeading: { flex: 1, minWidth: 0 },
  actionDeckEyebrow: { color: installerTheme.textFaint, fontFamily: installerTheme.fontFamilyMono, fontSize: installerTheme.type.caption },
  actionDeckTitle: { color: installerTheme.text, fontSize: installerTheme.type.caption, fontWeight: "800", marginTop: 2 },
  offlineReady: { flexDirection: "row", alignItems: "center", gap: 4 },
  offlineReadyDot: {
    width: 6,
    height: 6,
    borderRadius: installerTheme.radius.pill,
    backgroundColor: installerTheme.successFill,
    shadowColor: installerTheme.successFill,
    shadowOpacity: 0.8,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
  offlineReadyText: { color: installerTheme.success, fontFamily: installerTheme.fontFamilyMono, fontSize: installerTheme.type.caption },
  notInstalledPanel: {
    borderTopWidth: 1,
    borderTopColor: installerTheme.dangerBorder,
    marginTop: 12,
    paddingTop: 12,
  },
  notInstalledHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  notInstalledHeading: { flex: 1, minWidth: 0 },
  notInstalledTitle: { color: installerTheme.text, fontSize: 12, fontWeight: "800" },
  notInstalledMeta: { color: installerTheme.danger, fontFamily: installerTheme.fontFamilyMono, fontSize: installerTheme.type.caption, marginTop: 3 },
  reasonCode: { color: installerTheme.textFaint, fontSize: installerTheme.type.caption, marginTop: 6 },
  doorActions: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 11 },
  actionButtonSlot: { flexGrow: 1, flexBasis: 140 },
  reportButton: { marginTop: 9 },
  updatedText: { color: installerTheme.textFaint, fontSize: installerTheme.type.caption, textAlign: "center", marginTop: 9 },
});
