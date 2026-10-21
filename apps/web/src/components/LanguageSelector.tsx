import React from "react";
import { useTranslation } from "react-i18next";
import { isSupportedLocale, type SupportedLocale } from "@pomona/contract";

export function LanguageSelector({ locale, onChange }: { locale: SupportedLocale; onChange(locale: SupportedLocale): void }) {
  const { t } = useTranslation();
  return <select aria-label={t("language.label")} value={locale} onChange={(event) => {
    if (isSupportedLocale(event.target.value)) onChange(event.target.value);
  }} style={{ maxWidth: "150px", padding: "8px", borderRadius: "16px", background: "#FBFAF6", color: "#142117", border: "none", fontSize: "12px" }}>
    <option value="en-GB">{t("language.english")}</option>
    <option value="pt-BR">{t("language.portuguese")}</option>
  </select>;
}
