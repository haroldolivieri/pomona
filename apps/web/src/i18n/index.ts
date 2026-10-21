import { isSupportedLocale, translateShared } from "@pomona/contract";
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

function updateDocument(locale: string): void {
  if (typeof document === "undefined" || !isSupportedLocale(locale)) return;
  document.documentElement.lang = locale;
  document.title = translateShared(locale, "metadata.title");
  document.querySelector('meta[name="description"]')?.setAttribute("content", translateShared(locale, "metadata.description"));
}
i18n.on("languageChanged", updateDocument);
updateDocument(i18n.language);
