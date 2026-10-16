import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

export type HapticSignal = "success" | "warning" | "error" | "tap";

// The ExpoHaptics native module as expo-haptics calls it; resolved optionally so a binary built
// without the module (an older build running newer JavaScript) stays silent instead of crashing.
type ExpoHapticsModule = {
  notificationAsync(type: "success" | "warning" | "error"): Promise<void>;
  impactAsync(style: "light" | "medium" | "heavy"): Promise<void>;
};

let haptics: ExpoHapticsModule | null | undefined;

function loadHaptics(): ExpoHapticsModule | null {
  if (haptics === undefined) haptics = requireOptionalNativeModule<ExpoHapticsModule>("ExpoHaptics");
  return haptics;
}

/** Fires one tactile signal; never throws and never blocks the action it accompanies. */
export async function triggerHaptic(signal: HapticSignal): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const module = loadHaptics();
  if (!module) return false;
  try {
    if (signal === "tap") await module.impactAsync("light");
    else await module.notificationAsync(signal);
    return true;
  } catch {
    // Devices without a vibrator stay silent.
    return false;
  }
}
