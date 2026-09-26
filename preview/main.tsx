import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { View, Image } from "react-native";
import { useFonts } from "expo-font";
import { Manrope_400Regular } from "@expo-google-fonts/manrope/400Regular";
import { Manrope_600SemiBold } from "@expo-google-fonts/manrope/600SemiBold";
import { Manrope_700Bold } from "@expo-google-fonts/manrope/700Bold";
import { Sora_700Bold } from "@expo-google-fonts/sora/700Bold";
import { Sora_800ExtraBold } from "@expo-google-fonts/sora/800ExtraBold";
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono/500Medium";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ActionButton, BrandText as Text, ConfirmDialog, IconButton, MetricTile, ProgressRing, Row, ScreenHero, SectionCard, SectionHeader, SegmentedControl, StatusPill } from "../src/components/mobile-ui";
import { MotionProvider } from "../src/components/motion";
import { installerTheme as theme } from "../src/lib/theme";
import doorImage from "../assets/premium/door-premium.jpg";

// Local fixtures only. This preview never loads auth, SQLite, sync or API clients.
function Preview() {
  const [locale, setLocale] = useState("ru");
  const [filter, setFilter] = useState("ALL");
  const [selected, setSelected] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [presses, setPresses] = useState(0);
  const lt = (en: string, ru: string, he: string) => locale === "ru" ? ru : locale === "he" ? he : en;
  const [fontsLoaded, fontError] = useFonts({ ...Ionicons.font, Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold, Sora_700Bold, Sora_800ExtraBold, JetBrainsMono_500Medium });
  if (!fontsLoaded && !fontError) return <Text style={{ color: theme.text }}>Loading fonts</Text>;
  return <MotionProvider><View style={{ maxWidth: 480, width: "100%", alignSelf: "center", paddingBottom: 32 }}>
    <Text style={{ color: theme.warning, padding: 16, fontSize: 12 }}>UI TEST / LOCAL FIXTURES</Text>
    <SegmentedControl value={locale} onChange={setLocale} options={[{ value: "en", label: "EN" }, { value: "ru", label: "RU" }, { value: "he", label: "HE" }]} />
    <View style={{ direction: locale === "he" ? "rtl" : "ltr" }}>
      <ScreenHero title={lt("My work", "Мои работы", "העבודות שלי")} eyebrow="DIMAX INSTALLER" right={<IconButton icon="refresh" label={lt("Refresh", "Обновить", "רענון")} onPress={() => setPresses(value => value + 1)} />} />
      <View style={{ paddingHorizontal: 16, gap: 16 }}>
        <SectionCard>
          <SectionHeader title={lt("Building A", "Корпус A", "בניין א")} action={<StatusPill label={lt("In progress", "В работе", "בביצוע")} tone="info" />} />
          <View style={{ flexDirection: "row", gap: 16, alignItems: "center", paddingVertical: 18 }}>
            <ProgressRing value={installed ? 75 : 50} size={64} tone={theme.success} />
            <View style={{ flex: 1 }}><Text style={{ color: theme.text, fontSize: 22, fontWeight: "700" }}>{installed ? "3 / 4" : "2 / 4"}</Text><Text style={{ color: theme.textMuted, fontSize: 12 }}>{lt("doors installed", "дверей установлено", "דלתות הותקנו")}</Text></View>
          </View>
          <ActionButton label={lt("Open door", "Открыть дверь", "פתיחת דלת")} icon="arrow-forward" onPress={() => setSelected(true)} />
        </SectionCard>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <MetricTile label={lt("Accrued", "Начислено", "נצבר")} value="500 ILS" tone="success" onPress={() => setPresses(value => value + 1)} />
          <MetricTile label={lt("Queued", "В очереди", "בתור")} value={installed ? 1 : 0} tone="warning" />
        </View>
        <SegmentedControl dark value={filter} onChange={setFilter} options={[{ value: "ALL", label: lt("All", "Все", "הכל"), count: 4 }, { value: "OPEN", label: lt("Remaining", "Осталось", "נותרו"), count: installed ? 1 : 2 }]} />
        <SectionCard>
          <SectionHeader title={lt("Floor 2", "Этаж 2", "קומה 2")} meta={filter === "ALL" ? 4 : installed ? 1 : 2} />
          <Row icon="business-outline" title="A-2-201" subtitle={lt("Entrance door", "Входная дверь", "דלת כניסה")} value={lt("Apartment 201", "Кв. 201", "דירה 201")} tone={installed ? "success" : "info"} onPress={() => setSelected(true)} />
        </SectionCard>
        {selected ? <SectionCard>
          <SectionHeader title={lt("Door details", "Карточка двери", "פרטי דלת")} action={<IconButton icon="close" label={lt("Close", "Закрыть", "סגירה")} onPress={() => setSelected(false)} />} />
          <Image source={{ uri: doorImage }} style={{ width: "100%", height: 180, borderRadius: 12, marginVertical: 12 }} resizeMode="cover" />
          <StatusPill label={installed ? lt("Installed", "Установлено", "הותקנה") : lt("Not installed", "Не установлено", "לא הותקנה")} tone={installed ? "success" : "warning"} />
          <View style={{ gap: 10, marginTop: 14 }}>
            <ActionButton label={lt("Installed", "Установлено", "הותקנה")} icon="checkmark-circle-outline" disabled={installed} onPress={() => setConfirm(true)} />
            <ActionButton label={lt("Report issue", "Сообщить о проблеме", "דיווח תקלה")} icon="alert-circle-outline" variant="danger" onPress={() => setPresses(value => value + 1)} />
          </View>
        </SectionCard> : null}
        <SectionCard><SectionHeader title={lt("Saved work", "Сохранённые работы", "עבודות שמורות")} /><Row icon="cloud-upload-outline" title={lt("Sync queue", "Очередь синхронизации", "תור סנכרון")} value={String(installed ? 1 : 0)} onPress={() => setPresses(value => value + 1)} /><ActionButton label={lt("Syncing", "Синхронизация", "מסנכרן")} loading onPress={() => setPresses(value => value + 1)} /></SectionCard>
        <Text accessibilityLiveRegion="polite" style={{ color: theme.textMuted }}>Test actions: {presses}</Text>
      </View>
    </View>
    <ConfirmDialog visible={confirm} title={lt("Complete test work?", "Завершить тестовую работу?", "לסיים עבודת בדיקה?")} message={lt("Local preview only", "Только локальный стенд", "תצוגה מקומית בלבד")} confirmLabel={lt("Confirm", "Подтвердить", "אישור")} cancelLabel={lt("Cancel", "Отмена", "ביטול")} onCancel={() => setConfirm(false)} onConfirm={() => { setInstalled(true); setConfirm(false); }} />
  </View></MotionProvider>;
}

createRoot(document.getElementById("root")!).render(<Preview />);
