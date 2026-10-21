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
      return { tag: match?.[1].toLowerCase(), language: match?.[1].toLowerCase().split("-")[0], quality: match ? Number(match[2] ?? 1) : 0, index };
    })
    .filter(({ language }) => language === "pt" || language === "en")
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  const matches = SUPPORTED_LOCALES.map((locale) => {
    const tag = locale.toLowerCase();
    const language = tag.split("-")[0];
    // An exact preference, including q=0, takes precedence over a broader range.
    const preference = preferences.find((entry) => entry.tag === tag)
      ?? preferences.find((entry) => entry.tag === language)
      ?? preferences.find((entry) => entry.language === language);
    return { locale, quality: preference?.quality ?? 0, index: preference?.index ?? Infinity };
  }).filter((entry) => entry.quality > 0).sort((a, b) => b.quality - a.quality || a.index - b.index);
  return matches[0]?.locale ?? "en-GB";
}
