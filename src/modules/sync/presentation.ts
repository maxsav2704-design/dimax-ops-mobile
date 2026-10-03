import { translateEnum, type MobileLocale } from "@/lib/i18n";
import { MAX_AUTO_RETRY_ATTEMPTS } from "@/modules/sync/policy";
import type { PendingSyncEvent, SyncQueueSummary } from "@/modules/sync/types";

export function getQueueReadState(
  summary: SyncQueueSummary | null,
  loading: boolean,
  failed: boolean,
): "loading" | "error" | "ready" {
  if (loading) return "loading";
  return failed || summary === null ? "error" : "ready";
}

type QueueResolution = {
  title: string;
  detail: string;
  action: string;
  retryAllowed: boolean;
  dropAllowed: boolean;
};

export function needsSyncAttention(event: PendingSyncEvent): boolean {
  return event.status !== "PENDING" || event.attempts >= MAX_AUTO_RETRY_ATTEMPTS;
}

function text(locale: MobileLocale, en: string, ru: string, he: string): string {
  if (locale === "ru") return ru;
  if (locale === "he") return he;
  return en;
}

export function buildProfileQueuePresentation(
  summary: SyncQueueSummary | null,
  loading: boolean,
  failed: boolean,
  locale: MobileLocale,
): {
  state: ReturnType<typeof getQueueReadState>;
  tone: "neutral" | "danger" | "warning" | "success";
  subtitle: string;
  signOutMessage: string;
} {
  const state = getQueueReadState(summary, loading, failed);
  if (state !== "ready" || summary === null) {
    return {
      state,
      tone: state === "loading" ? "neutral" : "warning",
      subtitle: state === "loading"
        ? text(locale, "Checking saved work...", "Проверяем сохранённые работы...", "בודקים עבודות שמורות...")
        : text(locale, "Could not check saved work. Try again.", "Не удалось проверить сохранённые работы. Повторите проверку.", "לא ניתן לבדוק עבודות שמורות. נסו שוב."),
      signOutMessage: text(
        locale,
        "The queue could not be verified. Work may still be waiting on this phone. Signing out will not send or delete it; return with the same account to continue. Sign out?",
        "Очередь не удалось проверить. На телефоне могут оставаться неотправленные работы. Выход не отправит и не удалит их; для продолжения потребуется войти в тот же аккаунт. Выйти?",
        "לא ניתן לאמת את התור. ייתכן שעבודות עדיין ממתינות במכשיר. יציאה לא תשלח או תמחק אותן; יש להתחבר שוב לאותו חשבון כדי להמשיך. לצאת?",
      ),
    };
  }
  if (summary.total > 0) {
    return {
      state,
      tone: summary.blocked > 0 ? "danger" : "warning",
      subtitle: text(locale, `${summary.total} actions waiting`, `Ожидают действий: ${summary.total}`, `${summary.total} פעולות ממתינות`),
      signOutMessage: text(
        locale,
        `${summary.total} actions have not been sent. They will stay on this phone for this account. Signing out will not sync them; sign in again with the same account to continue. Sign out?`,
        `Не отправлено действий: ${summary.total}. Они останутся на этом телефоне в текущем аккаунте. Выход не отправит их; для продолжения потребуется войти в тот же аккаунт. Выйти?`,
        `${summary.total} פעולות טרם נשלחו. הן יישארו במכשיר עבור החשבון הזה. יציאה לא תסנכרן אותן; יש להתחבר שוב לאותו חשבון כדי להמשיך. לצאת?`,
      ),
    };
  }
  return {
    state,
    tone: "success",
    subtitle: text(locale, "No actions waiting to be sent", "Нет действий, ожидающих отправки", "אין פעולות הממתינות לשליחה"),
    signOutMessage: text(locale, "Sign out of DIMAX Installer?", "Выйти из DIMAX Installer?", "לצאת מ-DIMAX Installer?"),
  };
}

export function buildEventSummary(
  event: PendingSyncEvent,
  locale: MobileLocale = "en",
  labels: { doorLabel?: string; addonLabel?: string } = {},
): string {
  if (event.type === "DOOR_SET_STATUS") {
    const doorId =
      labels.doorLabel || (typeof event.payload.door_id === "string"
        ? event.payload.door_id
        : text(locale, "door", "дверь", "דלת"));
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
      labels.addonLabel || (typeof event.payload.addon_type_id === "string"
        ? event.payload.addon_type_id
        : text(locale, "add-on", "допработа", "עבודה נוספת"));
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

  if (code === "CONFLICT_FACTORY_PRICE") {
    return {
      title: text(locale, "Price needs review", "Нужно проверить цену", "נדרשת בדיקת מחיר"),
      detail: text(locale,
        "The saved price version could not be confirmed for this work. No earnings were posted.",
        "Сохранённую версию цены для этой работы подтвердить не удалось. Начисления не проведены.",
        "לא ניתן לאמת את גרסת המחיר השמורה לעבודה זו. לא נרשמה הכנסה."),
      action: text(locale,
        "Keep this record and contact the administrator. Do not submit the same work again.",
        "Сохраните запись и свяжитесь с администратором. Не создавайте эту работу повторно.",
        "שמרו את הרשומה ופנו למנהל. אין להזין את אותה עבודה שוב."),
      retryAllowed: false,
      dropAllowed: false,
    };
  }

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
        "Sync to refresh assignments, then contact the office before discarding this action.",
        "Обновите назначения через синхронизацию и свяжитесь с офисом перед удалением действия.",
        "סנכרנו לרענון השיוכים ופנו למשרד לפני מחיקת הפעולה."
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

  if (event.status === "FAILED" && event.attempts < MAX_AUTO_RETRY_ATTEMPTS) {
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

  if (
    (event.status === "BLOCKED" && isAutoRetryLimit(event.error)) ||
    (event.status !== "BLOCKED" && event.attempts >= MAX_AUTO_RETRY_ATTEMPTS)
  ) {
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
      dropAllowed: event.status === "BLOCKED",
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
