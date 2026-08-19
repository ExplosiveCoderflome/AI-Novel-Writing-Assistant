import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import translationZH from "./locales/zh/translation.json";
import translationEN from "./locales/en/translation.json";

const resources = {
  zh: {
    translation: translationZH,
  },
  en: {
    translation: translationEN,
  },
};

const savedLanguage = localStorage.getItem("app_language") || "zh";

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: savedLanguage,
    fallbackLng: "zh",
    interpolation: {
      escapeValue: false, // react already escapes values
    },
  });

export default i18n;
