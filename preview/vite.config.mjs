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

const projectFixtures = fileURLToPath(new URL("./project-fixtures.tsx", import.meta.url));
const nativePreviewAssets = {
  name: "native-preview-assets",
  enforce: "pre",
  transform(code, id) {
    if (!id.replaceAll("\\", "/").includes("/app/")) return;
    const imports = [];
    const body = code.replace(/require\(("|')([^"']+\.(?:png|jpg))\1\)/g, (_match, _quote, path) => {
      const name = `previewAsset${imports.length}`;
      imports.push(`import ${name} from ${JSON.stringify(path)};`);
      return `{ uri: ${name} }`;
    });
    if (imports.length) return `${imports.join("\n")}\n${body}`;
  },
};

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: {
    alias: [
      { find: "@/modules/projects/repository", replacement: fileURLToPath(new URL("./home-fixtures.ts", import.meta.url)) },
      { find: "@/modules/journal/service", replacement: fileURLToPath(new URL("./journal-fixtures.ts", import.meta.url)) },
      { find: "@/modules/journal/workspace", replacement: fileURLToPath(new URL("./journal-fixtures.ts", import.meta.url)) },
      { find: "@/modules/earnings/service", replacement: fileURLToPath(new URL("./earnings-fixtures.ts", import.meta.url)) },
      { find: "@/modules/calendar/service", replacement: fileURLToPath(new URL("./calendar-fixtures.ts", import.meta.url)) },
      ...["expo-router", "@/providers/AppProviders", "@/components/installer-ui", "@/modules/projects/local-workspace", "@/modules/projects/service", "@/modules/projects/external-actions", "@/modules/doors/actions", "@/modules/sync/service"].map((find) => ({ find, replacement: projectFixtures })),
      { find: /^react-native$/, replacement: "react-native-web" },
      { find: /^react-native-svg$/, replacement: fileURLToPath(new URL("../node_modules/react-native-svg/lib/module/elements.web.js", import.meta.url)) },
      { find: "@", replacement: fileURLToPath(new URL("../src", import.meta.url)) },
    ],
    extensions: [".web.tsx", ".tsx", ".web.ts", ".ts", ".web.js", ".js", ".mjs", ".json"],
  },
  define: { "process.env.EXPO_OS": '"web"', __DEV__: "true", global: "globalThis" },
  plugins: [{ ...webPlatform, enforce: "pre" }, stripRegistryFlow, nativePreviewAssets, {
    name: "expo-web-jsx", enforce: "pre",
    transform(code, id) {
      if (/node_modules.*\.js$/.test(id)) return transformWithOxc(code, id, { lang: "jsx" });
    },
  }],
  optimizeDeps: { rolldownOptions: { moduleTypes: { ".js": "jsx" }, plugins: [webPlatform, stripRegistryFlow] } },
  assetsInclude: ["**/*.ttf"],
  server: { host: "127.0.0.1", port: 4188, strictPort: true },
});
