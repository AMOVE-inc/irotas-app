const fs = require("fs");
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

// NativeWind creates this production CSS file after Metro starts crawling.
// Creating the placeholder first lets clean CI/EAS builds include it in Metro's file map.
const cssInteropRoot = path.dirname(require.resolve("react-native-css-interop/package.json"));
const webCssCache = path.join(cssInteropRoot, ".cache", "web.css");
fs.mkdirSync(path.dirname(webCssCache), { recursive: true });
if (!fs.existsSync(webCssCache)) fs.writeFileSync(webCssCache, "");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, {
  input: "./global.css",
  // Force write CSS to file system instead of virtual modules
  // This fixes iOS styling issues in development mode
  forceWriteFileSystem: true,
});
