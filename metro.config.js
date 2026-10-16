const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const config = getDefaultConfig(__dirname);

// Generated native output and private device evidence are never JS sources.
const generatedPaths = [".tmp", "artifacts", "android/.gradle", "android/build", "android/app/build", "android/app/.cxx"];
const generatedPatterns = generatedPaths.map((directory) => {
  const absolute = path.resolve(__dirname, directory).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${absolute}(?:[/\\\\]|$)`);
});
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : [config.resolver.blockList]).filter(Boolean),
  ...generatedPatterns,
];

// Watchman is not available on the Windows DIMAX workstations. Let Metro use
// its native crawler instead of waiting for a watcher that cannot start.
if (process.platform === "win32") {
  config.resolver.useWatchman = false;
}

module.exports = config;
