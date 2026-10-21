import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import i18n from "../src/i18n";
import { CameraViewfinder } from "../src/components/CameraViewfinder";
import { ScanErrorStage } from "../src/components/ScanErrorStage";
import { describeBoxPosition } from "../src/lib/spatial-a11y";
afterEach(async () => { cleanup(); await i18n.changeLanguage("en-GB"); });
it("renders Portuguese camera copy and accessible controls", async () => {
  await i18n.changeLanguage("pt-BR");
  render(<CameraViewfinder onCapture={vi.fn()} />);
  expect(screen.getByText("Aponte para uma fruta ou um grupo")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Tirar foto" })).toBeTruthy();
});
it("renders Portuguese abstention and quota controls", async () => {
  await i18n.changeLanguage("pt-BR");
  render(<ScanErrorStage status="insufficient_evidence" photoDataUrl={null} onRetake={vi.fn()} />);
  expect(screen.getByText("Faltam detalhes para escolher")).toBeTruthy();
});
it("localizes spatial guidance", async () => {
  await i18n.changeLanguage("pt-BR");
  expect(describeBoxPosition([0,0,100,100], "Escolhido", 8.6)).toBe("Escolhido: linha de cima, esquerda, nota 8.6 de 10");
});
it("pluralizes scan counts", async () => {
  await act(async () => { await i18n.changeLanguage("pt-BR"); });
  expect(i18n.t("camera.scansLeftToday", {count:1})).toBe("1 análise restante hoje");
  expect(i18n.t("camera.scansLeftToday", {count:2})).toBe("2 análises restantes hoje");
});
