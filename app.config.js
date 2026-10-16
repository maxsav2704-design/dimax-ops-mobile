module.exports = ({ config }) => {
  if (process.env.EXPO_PUBLIC_BUILD_PROFILE !== "acceptance") return config;
  return {
    ...config,
    name: "DIMAX Test",
    scheme: "dimax-installer-acceptance",
    android: { ...config.android, package: "com.dimax.operations.installer.acceptance" },
  };
};
