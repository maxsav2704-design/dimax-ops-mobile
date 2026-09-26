import { defineConfig, transformWithOxc } from "vite";
import { fileURLToPath } from "node:url";
import { transformSync } from "@babel/core";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const webPlatform = {
  name: "expo-web-platform",
  resolveId(source, importer) {
    if (!source.startsWith(".") || !importer) return;
    const base = resolve(dirname(importer), source.replace(/\.(?:js|ts|tsx)$/, ""));
    for (const suffix of [".web.tsx", ".web.ts", ".web.js"]) {
      if (existsSync(base + suffix)) return base + suffix;
    }
  },
};

const stripRegistryFlow = {
  name: "expo-asset-registry-flow",
  transform(code, id) {
    if (!id.replaceAll("\\", "/").includes("@react-native/assets-registry/registry.js")) return;
    return transformSync(code, { filename: id, babelrc: false, configFile: false, plugins: ["@babel/plugin-transform-flow-strip-types"] });
  },
};

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: {
    alias: [
      { find: /^react-native$/, replacement: "react-native-web" },
      { find: /^react-native-svg$/, replacement: fileURLToPath(new URL("../node_modules/react-native-svg/lib/module/elements.web.js", import.meta.url)) },
      { find: "@", replacement: fileURLToPath(new URL("../src", import.meta.url)) },
    ],
    extensions: [".web.tsx", ".tsx", ".web.ts", ".ts", ".web.js", ".js", ".mjs", ".json"],
  },
  define: { "process.env.EXPO_OS": '"web"', __DEV__: "true", global: "globalThis" },
  plugins: [{ ...webPlatform, enforce: "pre" }, stripRegistryFlow, {
    name: "expo-web-jsx", enforce: "pre",
    transform(code, id) {
      if (/node_modules.*\.js$/.test(id)) return transformWithOxc(code, id, { lang: "jsx" });
    },
  }],
  optimizeDeps: { rolldownOptions: { moduleTypes: { ".js": "jsx" }, plugins: [webPlatform, stripRegistryFlow] } },
  assetsInclude: ["**/*.ttf"],
  server: { host: "127.0.0.1", port: 4188, strictPort: true },
});
