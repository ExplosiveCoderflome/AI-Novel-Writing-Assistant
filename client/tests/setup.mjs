import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import i18next from "i18next";

// Mock localStorage globally
global.localStorage = {
  getItem: (key) => {
    if (key === "app_language") return "zh";
    return null;
  },
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
};

// Load translations using fs to avoid Node ESM JSON import attribute error
const dirname = path.dirname(fileURLToPath(import.meta.url));
const translationZH = JSON.parse(
  fs.readFileSync(path.join(dirname, "../src/locales/zh/translation.json"), "utf8")
);
const translationEN = JSON.parse(
  fs.readFileSync(path.join(dirname, "../src/locales/en/translation.json"), "utf8")
);

// Initialize i18next globally for all test processes
i18next.init({
  resources: {
    zh: { translation: translationZH },
    en: { translation: translationEN },
  },
  lng: "zh",
  fallbackLng: "zh",
  interpolation: {
    escapeValue: false,
  },
});
