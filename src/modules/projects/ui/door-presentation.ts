import type Ionicons from "@expo/vector-icons/Ionicons";
import type React from "react";
import { toneColors, type InstallerTone } from "@/lib/theme";
import type { InstallerDoor } from "@/modules/projects/types";

export function formatIssueCount(locale: "en" | "ru" | "he", count: number) {
  if (locale === "he") return `${count} ${count === 1 ? "תקלה" : "תקלות"}`;
  if (locale === "en") return `${count} ${count === 1 ? "issue" : "issues"}`;

  const modulo100 = count % 100;
  const modulo10 = count % 10;
  const noun = modulo10 === 1 && modulo100 !== 11
    ? "проблема"
    : modulo10 >= 2 && modulo10 <= 4 && (modulo100 < 12 || modulo100 > 14)
      ? "проблемы"
      : "проблем";
  return `${count} ${noun}`;
}

export function buildDoorPositionLabel(door: InstallerDoor, locale: "en" | "ru" | "he") {
  if (door.apartment_number) {
    const prefix = locale === "ru" ? "кв." : locale === "he" ? "דירה" : "Apt";
    return `${prefix} ${door.apartment_number}`;
  }
  if (door.location_code) return door.location_code;
  if (door.door_marking) return door.door_marking;
  if (door.house_number) {
    const prefix = locale === "ru" ? "дом" : locale === "he" ? "בניין" : "House";
    return `${prefix} ${door.house_number}`;
  }
  return locale === "ru" ? "позиция" : locale === "he" ? "מיקום" : "Position";
}

export function doorStatusIcon(
  door: InstallerDoor,
  hasIssue: boolean,
): React.ComponentProps<typeof Ionicons>["name"] {
  if (hasIssue) return "alert";
  if (door.status === "INSTALLED") return "checkmark";
  if (door.status === "NOT_INSTALLED") return "time-outline";
  if (door.status === "LOCKED" || door.is_locked) return "lock-closed";
  return "construct-outline";
}

export function doorStatusTone(door: InstallerDoor, hasIssue: boolean): InstallerTone {
  if (hasIssue) return "danger";
  if (door.status === "INSTALLED") return "success";
  if (door.status === "NOT_INSTALLED") return "warning";
  if (door.status === "LOCKED" || door.is_locked) return "neutral";
  return "info";
}

export function doorStatusColors(door: InstallerDoor, hasIssue: boolean) {
  return toneColors(doorStatusTone(door, hasIssue));
}
