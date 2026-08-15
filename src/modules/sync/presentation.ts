import { translateEnum, type MobileLocale } from "@/lib/i18n";
import type { PendingSyncEvent } from "@/modules/sync/types";

type QueueResolution = {
  title: string;
  detail: string;
  action: string;
  retryAllowed: boolean;
  dropAllowed: boolean;
};

function text(locale: MobileLocale, en: string, ru: string, he: string): string {
  if (locale === "ru") return ru;
  if (locale === "he") return he;
  return en;
}

export function buildEventSummary(event: PendingSyncEvent, locale: MobileLocale = "en"): string {
  if (event.type === "DOOR_SET_STATUS") {
    const doorId =
      typeof event.payload.door_id === "string"
        ? event.payload.door_id
        : text(locale, "door", "дверь", "דלת");
    const status =
      typeof event.payload.status === "string"
        ? translateEnum(locale, event.payload.status)
        : text(locale, "UNKNOWN", "НЕИЗВЕСТНО", "לא ידוע");
    return text(
      locale,
      `Door ${doorId} -> ${status}`,
      `Дверь ${doorId} → ${status}`,
      `דלת ${doorId} ← ${status}`
    );
  }

  if (event.type === "ADDON_FACT_CREATE") {
    const addonId =
      typeof event.payload.addon_type_id === "string"
        ? event.payload.addon_type_id
        : text(locale, "add-on", "допработа", "עבודה נוספת");
    const quantity = typeof event.payload.qty_done === "string" ? event.payload.qty_done : "-";
    return text(
      locale,
      `Add-on ${addonId} qty ${quantity}`,
      `Допработа ${addonId}, количество ${quantity}`,
      `עבודה נוספת ${addonId}, כמות ${quantity}`
    );
  }

  if (event.type === "ISSUE_CREATE") {
    const title =
      typeof event.payload.title === "string" && event.payload.title.trim()
        ? event.payload.title.trim()
        : text(locale, "New issue", "Новая проблема", "תקלה חדשה");
    return text(locale, `Issue: ${title}`, `Проблема: ${title}`, `תקלה: ${title}`);
  }

  return translateEnum(locale, event.type);
}

export function getStatusTone(status: PendingSyncEvent["status"]): string {
  if (status === "BLOCKED") return "#C0392B";
  if (status === "FAILED") return "#A65300";
  return "#2D8F4E";
}

function errorCode(error: string | null): string | null {
  if (!error) return null;
  return error.replace(" (auto retry limit reached)", "").trim() || null;
}

function isAutoRetryLimit(error: string | null): boolean {
  return Boolean(error?.includes("auto retry limit reached"));
}

export function buildQueueResolution(
  event: PendingSyncEvent,
  locale: MobileLocale = "en"
): QueueResolution {
  const code = errorCode(event.error);

  if (code === "CONFLICT_ASSIGNMENT_CHANGED") {
    return {
      title: text(locale, "Assignment changed", "Назначение изменилось", "השיוך השתנה"),
      detail: text(
        locale,
        "The office changed this door or project after the offline action was created.",
        "Офис изменил дверь или объект после создания офлайн-действия.",
        "המשרד שינה את הדלת או הפרויקט לאחר יצירת הפעולה הלא מקוונת."
      ),
      action: text(
        locale,
        "Refresh data first. If the door is still yours, retry; otherwise contact the office.",
        "Сначала обновите данные. Если дверь всё ещё назначена вам, повторите; иначе свяжитесь с офисом.",
        "רעננו נתונים. אם הדלת עדיין משויכת אליכם, נסו שוב; אחרת פנו למשרד."
      ),
      retryAllowed: false,
      dropAllowed: true,
    };
  }

  if (code === "CONFLICT_INVALID_TRANSITION") {
    return {
      title: text(locale, "Status step is no longer valid", "Переход статуса больше недоступен", "מעבר הסטטוס אינו תקין עוד"),
      detail: text(
        locale,
        "The server has a newer door status, so this saved offline step is outdated.",
        "На сервере уже новый статус двери, поэтому сохранённое офлайн-действие устарело.",
        "בשרת קיים סטטוס דלת חדש יותר, ולכן הפעולה שנשמרה אינה עדכנית."
      ),
      action: text(
        locale,
        "Open the project after refresh and choose the next allowed status.",
        "Обновите данные, откройте объект и выберите разрешённый следующий статус.",
        "רעננו נתונים, פתחו את הפרויקט ובחרו את הסטטוס הבא המותר."
      ),
      retryAllowed: false,
      dropAllowed: true,
    };
  }

  if (code === "AUTH_REQUIRED" || event.error?.toLowerCase().includes("auth")) {
    return {
      title: text(locale, "Sign in again", "Войдите снова", "יש להתחבר מחדש"),
      detail: text(
        locale,
        "The server needs a fresh login before it can accept queued work.",
        "Серверу нужен новый вход, прежде чем принять работы из очереди.",
        "השרת דורש התחברות חדשה לפני קבלת הפעולות שבתור."
      ),
      action: text(
        locale,
        "Log out, sign in again, then return to this queue.",
        "Выйдите, войдите снова и вернитесь к очереди.",
        "התנתקו, התחברו מחדש וחזרו לתור."
      ),
      retryAllowed: false,
      dropAllowed: false,
    };
  }

  if (event.status === "FAILED") {
    return {
      title: text(locale, "Temporary sync failure", "Временная ошибка синхронизации", "שגיאת סנכרון זמנית"),
      detail: text(
        locale,
        "The item is scheduled for automatic retry.",
        "Действие запланировано для автоматической повторной отправки.",
        "הפעולה מתוזמנת לניסיון אוטומטי נוסף."
      ),
      action: text(
        locale,
        "You can retry now if the internet connection is stable.",
        "Можно повторить сейчас, если интернет стабилен.",
        "אפשר לנסות עכשיו אם החיבור לאינטרנט יציב."
      ),
      retryAllowed: true,
      dropAllowed: false,
    };
  }

  if (event.status === "BLOCKED" && isAutoRetryLimit(event.error)) {
    return {
      title: text(locale, "Retry limit reached", "Лимит повторов исчерпан", "הגעתם למגבלת הניסיונות"),
      detail: text(
        locale,
        "Sync failed several times and stopped automatic retries.",
        "Синхронизация несколько раз не прошла, автоматические повторы остановлены.",
        "הסנכרון נכשל מספר פעמים והניסיונות האוטומטיים הופסקו."
      ),
      action: text(
        locale,
        "Check internet and retry manually. If it fails again, contact the office.",
        "Проверьте интернет и повторите вручную. При повторной ошибке свяжитесь с офисом.",
        "בדקו את החיבור ונסו ידנית. אם השגיאה חוזרת, פנו למשרד."
      ),
      retryAllowed: true,
      dropAllowed: true,
    };
  }

  if (event.status === "BLOCKED") {
    return {
      title: text(locale, "Manual review needed", "Нужна ручная проверка", "נדרשת בדיקה ידנית"),
      detail: text(
        locale,
        "The queue item is blocked until the root cause is fixed.",
        "Действие заблокировано до устранения причины.",
        "הפעולה חסומה עד לתיקון הסיבה."
      ),
      action: text(
        locale,
        "Do not retry blindly. Refresh data or drop the stale queue item after office review.",
        "Не повторяйте вслепую. Обновите данные или удалите устаревшее действие после проверки с офисом.",
        "אל תנסו שוב ללא בדיקה. רעננו נתונים או מחקו את הפעולה לאחר בירור עם המשרד."
      ),
      retryAllowed: false,
      dropAllowed: true,
    };
  }

  return {
    title: text(locale, "Waiting for sync", "Ожидает синхронизации", "ממתין לסנכרון"),
    detail: text(
      locale,
      "The action is stored on this phone and ready to sync.",
      "Действие сохранено на телефоне и готово к отправке.",
      "הפעולה שמורה במכשיר ומוכנה לסנכרון."
    ),
    action: text(
      locale,
      "Keep working; it will sync automatically when possible.",
      "Продолжайте работу: действие отправится автоматически при появлении связи.",
      "אפשר להמשיך לעבוד; הפעולה תסתנכרן אוטומטית כשיתאפשר."
    ),
    retryAllowed: true,
    dropAllowed: false,
  };
}

export function canRetrySyncEvent(event: PendingSyncEvent): boolean {
  return buildQueueResolution(event).retryAllowed;
}
