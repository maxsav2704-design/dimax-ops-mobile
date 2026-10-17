import type { MobileLocale } from "@/lib/i18n";

// The offline workflow throws plain English messages (no locale in the service);
// screens pass them through here before showing them.
const MESSAGES: Record<string, { ru: string; he: string }> = {
  "Cold resync is blocked while unsynced work remains on this device.": {
    ru: "Полная пересинхронизация недоступна, пока на устройстве есть неотправленная работа.",
    he: "סנכרון מלא חסום כל עוד יש במכשיר עבודה שלא נשלחה.",
  },
  "Sync reset requested without snapshot": {
    ru: "Сервер запросил сброс без снимка данных",
    he: "השרת ביקש איפוס ללא תמונת נתונים",
  },
  "reason_id is required for NOT_INSTALLED": {
    ru: "Для статуса «Не установлено» нужна причина",
    he: "לסטטוס \"לא הותקן\" נדרשת סיבה",
  },
  "Door is no longer assigned to you. Refresh data before continuing.": {
    ru: "Дверь больше не назначена вам. Обновите данные, прежде чем продолжить.",
    he: "הדלת כבר אינה משויכת אליך. רעננו נתונים לפני שתמשיכו.",
  },
  "Door is locked. Refresh data or contact the office before continuing.": {
    ru: "Дверь заблокирована. Обновите данные или свяжитесь с офисом.",
    he: "הדלת נעולה. רעננו נתונים או פנו למשרד לפני שתמשיכו.",
  },
  "A door status update is already waiting in the sync queue.": {
    ru: "Обновление статуса этой двери уже ждёт в очереди синхронизации.",
    he: "עדכון סטטוס לדלת הזו כבר ממתין בתור הסנכרון.",
  },
  "Issue title must be at most 200 characters": {
    ru: "Заголовок проблемы: не более 200 символов",
    he: "כותרת התקלה: עד 200 תווים",
  },
  "Issue details must be at most 2000 characters": {
    ru: "Описание проблемы: не более 2000 символов",
    he: "תיאור התקלה: עד 2000 תווים",
  },
  "Extra work must be planned by the office before you record it.": {
    ru: "Доп. работу сначала планирует офис, затем монтажник фиксирует факт.",
    he: "המשרד מתכנן עבודה נוספת לפני שהמתקין מתעד אותה.",
  },
  "addon_type_id is required": {
    ru: "Выберите тип доп. работы",
    he: "יש לבחור סוג עבודה נוספת",
  },
  "qty_done must be > 0 with at most 10 integer and 2 decimal digits": {
    ru: "Количество должно быть больше 0, не более 10 цифр до запятой и 2 после",
    he: "הכמות חייבת להיות גדולה מ-0, עד 10 ספרות לפני הנקודה ו-2 אחריה",
  },
  "Project is no longer assigned to you. Refresh data before continuing.": {
    ru: "Объект больше не назначен вам. Обновите данные, прежде чем продолжить.",
    he: "הפרויקט כבר אינו משויך אליך. רעננו נתונים לפני שתמשיכו.",
  },
  "Add-on type is no longer available. Refresh data before continuing.": {
    ru: "Тип доп. работы больше недоступен. Обновите данные, прежде чем продолжить.",
    he: "סוג העבודה הנוספת אינו זמין עוד. רעננו נתונים לפני שתמשיכו.",
  },
  "project_id and door_id are required": {
    ru: "Нужно выбрать объект и дверь",
    he: "יש לבחור פרויקט ודלת",
  },
  "Issue title or details is required": {
    ru: "Укажите название или описание проблемы",
    he: "יש להזין כותרת או תיאור לתקלה",
  },
};

export function localizeWorkflowMessage(message: string, locale: MobileLocale): string {
  const entry = MESSAGES[message];
  if (!entry) return message;
  return locale === "ru" ? entry.ru : locale === "he" ? entry.he : message;
}
