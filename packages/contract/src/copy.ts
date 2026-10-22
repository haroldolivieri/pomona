import { createInstance } from "i18next";
import en from "./locales/en-GB.json";
import pt from "./locales/pt-BR.json";
import type { SupportedLocale } from "./locale";

const shared = createInstance();
void shared.init({ initAsync: false, resources: { "en-GB": { translation: en }, "pt-BR": { translation: pt } }, fallbackLng: "en-GB", interpolation: { escapeValue: false } });

export function translateShared(locale: SupportedLocale, key: string, values?: Record<string, string | number>): string {
  return shared.t(key, { ...values, lng: locale });
}
