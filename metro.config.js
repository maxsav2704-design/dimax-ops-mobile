const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Watchman is not available on the Windows DIMAX workstations. Let Metro use
// its native crawler instead of waiting for a watcher that cannot start.
if (process.platform === "win32") {
  config.resolver.useWatchman = false;
}

module.exports = config;
