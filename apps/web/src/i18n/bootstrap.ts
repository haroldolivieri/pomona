import { isSupportedLocale, LOCALE_COOKIE, resolveDisplayLocale, type SupportedLocale } from "@pomona/contract";

export function readInitialLocale(): SupportedLocale {
  if (typeof document === "undefined") return "en-GB";
  const embedded = document.documentElement.dataset.pomonaLocale;
  if (isSupportedLocale(embedded)) return embedded;
  let saved: string | undefined;
  try { saved = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${LOCALE_COOKIE}=`))?.slice(LOCALE_COOKIE.length + 1); } catch { /* Browser privacy settings may block cookies. */ }
  const languages = typeof navigator === "undefined" ? [] : navigator.languages;
  return resolveDisplayLocale(saved, languages.map((language, index) => `${language};q=${Math.max(0.001, 1 - index * 0.01).toFixed(3)}`).join(","));
}

export function saveLocalePreference(locale: SupportedLocale): void {
  if (!isSupportedLocale(locale)) return;
  try { document.cookie = `${LOCALE_COOKIE}=${locale}; Max-Age=31536000; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`; } catch { /* Keep the current-page choice when storage is blocked. */ }
}
