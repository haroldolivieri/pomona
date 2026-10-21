import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import pt from "./locales/pt-BR.json";
import { readInitialLocale } from "./bootstrap";

i18n.use(initReactI18next).init({
  resources: {
    "pt-BR": { translation: pt },
    "en-GB": {
      translation: en,
    },
  },
  lng: readInitialLocale(),
  initAsync: false,
  fallbackLng: "en-GB",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;

i18n.on("languageChanged", (locale) => { if (typeof document !== "undefined") document.documentElement.lang = locale; });
if (typeof document !== "undefined") document.documentElement.lang = i18n.language;
