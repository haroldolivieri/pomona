export const SUPPORTED_LOCALES = ["en-GB", "pt-BR"] as const;
export type SupportedLocale = typeof SUPPORTED_LOCALES[number];
export const LOCALE_COOKIE = "pomona_locale";

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return SUPPORTED_LOCALES.some((locale) => locale === value);
}

export function resolveDisplayLocale(
  saved: string | null | undefined,
  acceptLanguage: string | null | undefined,
): SupportedLocale {
  if (isSupportedLocale(saved)) return saved;
  const preferences = (acceptLanguage ?? "").slice(0, 4096).split(",").slice(0, 64)
    .map((entry, index) => {
      const match = entry.trim().match(/^([a-z]{2,8}(?:-[a-z0-9]{1,8})*|\*)(?:\s*;\s*q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?))?$/i);
      return { language: match?.[1].toLowerCase().split("-")[0], quality: match ? Number(match[2] ?? 1) : 0, index };
    })
    .filter(({ language, quality }) => quality > 0 && (language === "pt" || language === "en"))
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  return preferences[0]?.language === "pt" ? "pt-BR" : "en-GB";
}
