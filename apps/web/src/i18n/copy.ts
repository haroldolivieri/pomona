import i18n from "./index";
import { isSupportedLocale, type SupportedLocale } from "@pomona/contract";

export function currentDisplayLocale(): SupportedLocale {
  return isSupportedLocale(i18n.language) ? i18n.language : "en-GB";
}

export function uiCopy(key: string, values?: Record<string, string | number>, locale: SupportedLocale = currentDisplayLocale()): string {
  return i18n.t(key, { ...values, lng: locale });
}
