import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import i18n from "../../src/i18n";
import { CameraViewfinder } from "../../src/components/CameraViewfinder";
import { FreehandDrawStage } from "../../src/components/FreehandDrawStage";
import { AnalysingStage } from "../../src/components/AnalysingStage";

describe("Scan quota visibility across stages and languages", () => {
  it.each(["en-GB", "pt-BR"] as const)(
    "hides remaining-scan labels in %s across camera, draw, and analysis stages even when quota is exhausted",
    async (locale) => {
      await i18n.changeLanguage(locale);

      for (const count of [0, 7]) {
        const { unmount: u1 } = render(
          <CameraViewfinder
            remainingScans={count}
            onCapture={() => {}}
            onQuotaClick={() => {}}
          />
        );
        expect(screen.queryByTestId("scan-quota-pill")).not.toBeInTheDocument();
        expect(document.body.textContent).not.toContain(i18n.t("camera.scansLeftToday", { count }));
        u1();

        const { unmount: u2 } = render(
          <FreehandDrawStage
            photoDataUrl="data:image/png;base64,mock"
            onAnalyse={() => {}}
            onRetake={() => {}}
          />
        );
        expect(screen.queryByTestId("scan-quota-pill")).not.toBeInTheDocument();
        expect(document.body.textContent).not.toContain(i18n.t("camera.scansLeftToday", { count }));
        u2();

        const { unmount: u3 } = render(
          <AnalysingStage
            photoDataUrl="data:image/png;base64,mock"
          />
        );
        expect(screen.queryByTestId("scan-quota-pill")).not.toBeInTheDocument();
        expect(document.body.textContent).not.toContain(i18n.t("camera.scansLeftToday", { count }));
        u3();
      }
    }
  );
});
