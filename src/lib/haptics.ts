import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

export type HapticSignal = "success" | "warning" | "error" | "tap";

/** Fires one tactile signal; never throws and never blocks the action it accompanies. */
export async function triggerHaptic(signal: HapticSignal): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    if (signal === "tap") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      const type = signal === "success"
        ? Haptics.NotificationFeedbackType.Success
        : signal === "warning"
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Error;
      await Haptics.notificationAsync(type);
    }
    return true;
  } catch {
    // Devices without a vibrator or builds without the native module stay silent.
    return false;
  }
}
