import { describe, expect, it } from "vitest";
import { resolveDisplayLocale } from "@pomona/contract";

describe("display language acceptance", () => {
  it.each([
    ["en-GB", "pt-BR", "en-GB"], ["pt-BR", "en", "pt-BR"],
    ["invalid", "pt", "pt-BR"], [null, "pt-PT", "pt-BR"],
    [null, "PT-br", "pt-BR"], [null, "en-US", "en-GB"],
    [null, "es,pt;q=0.8,en;q=0.5", "pt-BR"],
    [null, "pt;q=0,en;q=1", "en-GB"], [null, "en;q=0,pt;q=0.4", "pt-BR"],
    [null, "pt;q=no,en", "en-GB"], [null, "pt;q=2,en", "en-GB"],
    [null, "pt;q=0.8,en;q=0.8", "pt-BR"],
    [null, "pt-BR;q=0,pt;q=0.8,en;q=0.5", "en-GB"],
    [null, "en-GB;q=0,en;q=1,pt;q=0.5", "pt-BR"],
    [null, "pt;q=0,pt-BR;q=1,en;q=0.5", "pt-BR"],
    [null, "*", "en-GB"], [null, "", "en-GB"], [null, null, "en-GB"],
    ["<script>", "pt", "pt-BR"], ["pt-PT", "en", "en-GB"],
  ])("saved=%s browser=%s resolves %s", (saved, browser, expected) => {
    expect(resolveDisplayLocale(saved, browser)).toBe(expected);
  });
});
