import type { MobileLocale } from "@/lib/i18n";
import type { InstallerTone } from "@/lib/theme";
import { normalizeAddonQuantity } from "@/modules/addons/quantity";
import { earningsMinorUnits } from "@/modules/earnings/decimal";
import type { PendingSyncEvent } from "@/modules/sync/types";
import type { FactoryPriceReadState } from "./contract";

export type WorkPricePresentation = {
  title: string;
  value: string | null;
  meta: string | null;
  note: string;
  tone: InstallerTone;
  estimate: { label: string; value: string } | null;
  link: "queue" | "earnings" | null;
  linkLabel: string | null;
};

const intlLocale = (locale: MobileLocale) => locale === "ru" ? "ru-RU" : locale === "he" ? "he-IL" : "en-GB";
const local = (locale: MobileLocale, en: string, ru: string, he: string) => locale === "ru" ? ru : locale === "he" ? he : en;
const money = (cents: number, locale: MobileLocale) =>
  `${new Intl.NumberFormat(intlLocale(locale), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100)} ILS`;

export function estimateFactoryAmount(rate: string, quantity: string): number | null {
  const normalized = normalizeAddonQuantity(quantity);
  const rateCents = earningsMinorUnits(rate);
  const quantityCents = normalized ? earningsMinorUnits(normalized) : null;
  if (rateCents === null || quantityCents === null || rateCents <= 0 || quantityCents <= 0) return null;
  const product = rateCents * quantityCents;
  if (!Number.isSafeInteger(product)) return null;
  // Decimal HALF_UP, matching the server. Preview only, never an earning or command field.
  const cents = Math.floor(product / 100) + (product % 100 >= 50 ? 1 : 0);
  return cents > 0 && cents <= 999999999999 ? cents : null;
}

export function buildWorkPrice(input: {
  prices: FactoryPriceReadState;
  kind: "DOOR" | "ADDON";
  targetId: string;
  locale: MobileLocale;
  quantity?: string;
  unit?: string;
  completed?: boolean;
  pending?: PendingSyncEvent;
  now?: number;
}): WorkPricePresentation {
  const { prices, kind, targetId, locale, pending } = input;
  const lt = (en: string, ru: string, he: string) => local(locale, en, ru, he);
  const base: WorkPricePresentation = {
    title: kind === "DOOR" ? lt("Installation rate", "Ставка монтажа", "תעריף התקנה")
      : lt("Rate per unit", "Ставка за единицу", "תעריף ליחידה"),
    value: null, meta: null, note: "", tone: "neutral", estimate: null, link: null, linkLabel: null,
  };
  if (pending) {
    const blocked = pending.status === "BLOCKED";
    return { ...base, tone: blocked ? "danger" : "warning",
      title: pending.error === "CONFLICT_FACTORY_PRICE" ? lt("Price needs review", "Нужно проверить цену", "נדרשת בדיקת מחיר")
        : blocked ? lt("Work needs review", "Работа требует проверки", "נדרשת בדיקת עבודה")
        : lt("Awaiting processing", "Ожидает обработки", "ממתין לעיבוד"),
      meta: typeof pending.payload.price_list_id === "string"
        ? lt("Execution price version saved", "Версия цены сохранена при выполнении", "גרסת המחיר נשמרה בעת הביצוע")
        : lt("No price version in this record", "В записи нет версии прайса", "אין גרסת מחיר ברשומה"),
      note: lt("Accrual is not yet confirmed on this device. The saved work is in the sync queue.", "Начисление ещё не подтверждено на этом устройстве. Сохранённая работа находится в очереди.", "רישום ההכנסה טרם אושר במכשיר זה. העבודה השמורה נמצאת בתור הסנכרון."),
      link: "queue", linkLabel: lt("Open work queue", "Открыть очередь работ", "פתיחת תור העבודות") };
  }
  if (input.completed) {
    return { ...base, title: lt("Installation earnings", "Начисление за монтаж", "שכר ההתקנה"),
      note: lt("Check recorded earnings for this project. Today's rate does not reprice completed work.",
        "Проверьте начисления по объекту. Сегодняшняя ставка не меняет заработок за выполненные работы.",
        "בדקו את ההכנסות שנרשמו בפרויקט. התעריף הנוכחי אינו משנה שכר עבור עבודות שבוצעו."),
      link: "earnings", linkLabel: lt("View project earnings", "Смотреть заработок по объекту", "הצגת הכנסות הפרויקט") };
  }
  if (prices.status === "loading") return { ...base, note: lt("Loading rate…", "Загружаем ставку…", "טוען תעריף…") };
  if (prices.status === "unavailable") return { ...base, tone: "warning",
    note: lt("Price cache unavailable. Sync to refresh it.", "Не удалось прочитать прайс. Обновите данные синхронизацией.", "עותק המחיר אינו זמין. סנכרנו לרענון הנתונים.") };
  const snapshot = prices.snapshot;
  if (!snapshot) return { ...base, note: lt("No confirmed rate saved. Check with the administrator.",
    "Подтверждённая ставка не сохранена. Уточните её у администратора.", "לא נשמר תעריף מאושר. בדקו עם המנהל.") };
  const item = snapshot.items.find((row) => row.kind === kind && row.target_id === targetId);
  if (Date.parse(snapshot.effective_from) > (input.now ?? Date.now())) return { ...base, tone: "warning",
    note: lt("The saved price list is not effective yet. Check the device time and sync.",
      "Сохранённый прайс ещё не действует. Проверьте время телефона и синхронизацию.", "המחירון השמור טרם נכנס לתוקף. בדקו את שעון המכשיר וסנכרנו.") };
  if (!item) return { ...base, tone: "warning", note: lt("This work has no rate in the confirmed list. Contact the administrator.",
    "В подтверждённом прайсе нет цены этой работы. Обратитесь к администратору.", "אין תעריף לעבודה זו במחירון המאושר. פנו למנהל.") };
  if (kind === "ADDON" && input.unit !== undefined && item.unit !== input.unit) return { ...base, tone: "warning",
    note: lt("The work unit differs from the price list. Contact the administrator.",
      "Единица работы отличается от прайса. Обратитесь к администратору.", "יחידת העבודה שונה מהמחירון. פנו למנהל.") };
  const cents = earningsMinorUnits(item.rate);
  if (cents === null || cents <= 0) return { ...base, tone: "warning", note: lt("Rate unavailable", "Ставка недоступна", "התעריף אינו זמין") };
  const meta = lt(`Factory confirmed · Saved list #${snapshot.version}`, `Подтверждено заводом · Сохранённый прайс №${snapshot.version}`, `באישור המפעל · מחירון שמור ${snapshot.version}`);
  const estimate = kind === "ADDON" ? estimateFactoryAmount(item.rate, input.quantity || "") : null;
  return { ...base, title: kind === "ADDON" ? `${base.title} · ${item.unit}` : base.title,
    value: money(cents, locale), meta, tone: "success",
    estimate: estimate === null ? null : { label: lt("Estimated, not accrued", "Предварительно, не начислено", "הערכה בלבד, טרם נרשמה"), value: money(estimate, locale) },
    note: kind === "DOOR" ? lt("Per door. Earnings are recorded after the work is processed.",
      "За одну дверь. Начисление после обработки выполненной работы.", "עבור דלת אחת. השכר נרשם לאחר עיבוד העבודה שבוצעה.")
      : estimate === null ? lt("Enter a valid quantity to preview the total.", "Укажите корректное количество для расчёта.", "הזינו כמות תקינה לחישוב הסכום.")
      : lt("Based on the entered quantity. The server verifies the price when processing the work.",
        "По введённому количеству. Сервер проверит цену при обработке работы.", "לפי הכמות שהוזנה. השרת יאמת את המחיר בעת עיבוד העבודה.") };
}
