import { afterEach, expect, it, vi } from "vitest";
import { readInitialLocale, saveLocalePreference } from "../src/i18n/bootstrap";
afterEach(() => { vi.restoreAllMocks(); document.cookie = "pomona_locale=; Max-Age=0; Path=/"; delete document.documentElement.dataset.pomonaLocale; vi.restoreAllMocks(); });
it("uses embedded locale without a startup request", () => {
  const fetch = vi.spyOn(window, "fetch");
  document.documentElement.dataset.pomonaLocale = "pt-BR";
  expect(readInitialLocale()).toBe("pt-BR");
  expect(fetch).not.toHaveBeenCalled();
});
it("uses saved explicit choice before browser languages", () => {
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-BR"]);
  document.cookie = "pomona_locale=en-GB; Path=/";
  expect(readInitialLocale()).toBe("en-GB");
});
it("uses browser language without edge data", () => {
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-PT"]);
  expect(readInitialLocale()).toBe("pt-BR");
});
it("survives blocked cookies", () => {
  vi.spyOn(document, "cookie", "set").mockImplementation(() => { throw new Error("blocked"); });
  expect(() => saveLocalePreference("pt-BR")).not.toThrow();
});
it("persists an explicit language", () => { saveLocalePreference("pt-BR"); expect(document.cookie).toContain("pomona_locale=pt-BR"); });
