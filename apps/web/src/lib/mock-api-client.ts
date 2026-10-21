import { isSupportedLocale } from "@pomona/contract";
import { uiCopy } from "../i18n/copy";
import { lookupProduceSeasonality, type ScanRequest, type ScanResponse } from "@pomona/contract";
import type { PomonaApiClient, QuotaInfo } from "./api-client";

function mockSeasonality(request: ScanRequest) {
  return lookupProduceSeasonality("watermelon", { locale: request.locale }, new Date().getMonth() + 1, isSupportedLocale(request.locale) ? request.locale : "en-GB");
}

export function createMockApiClient(): PomonaApiClient {
  let mockRemainingScans = 10;

  return {
    async getQuota(): Promise<QuotaInfo> {
      return {
        remainingDeviceScans: mockRemainingScans,
        budgetOpen: true,
      };
    },

    async overrideQuota(
      params: { remainingScans?: number; deviceDailyLimit?: number; reset?: boolean } | number
    ) {
      if (typeof params === "number") {
        mockRemainingScans = Math.max(0, params);
      } else if (params.reset) {
        mockRemainingScans = 10;
      } else if (typeof params.remainingScans === "number") {
        mockRemainingScans = Math.max(0, params.remainingScans);
      }
      return {
        success: true,
        deviceId: "mock-device-id",
        deviceLimit: 10,
        remainingDeviceScans: mockRemainingScans,
      };
    },

    async submitScan(request: ScanRequest): Promise<{
      remainingScans: number;
      response: ScanResponse;
    }> {
      // Simulate natural AI latency (800ms)
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Allow simulating error states via localStorage in mock mode
      let forcedError: string | null = null;
      try {
        if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
          forcedError = localStorage.getItem("pomona-force-error");
        }
      } catch {}

      if (forcedError === "unclear_photo") {
        return {
          remainingScans: mockRemainingScans, // Errors do not burn daily quota
          response: {
            schemaVersion: "1.0",
            promptVersion: "v1",
            modelId: "gemini-2.5-flash (mocked)",
            round: request.round,
            status: "unclear_photo",
            message: uiCopy("copy.theCapturedPhotoIsTooBlurryOr", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
            produce: null,
            candidates: [],
            verdict: null,
            followUp: null,
            afterPurchase: null,
          },
        };
      }

      if (forcedError === "no_produce") {
        return {
          remainingScans: mockRemainingScans, // Errors do not burn daily quota
          response: {
            schemaVersion: "1.0",
            promptVersion: "v1",
            modelId: "gemini-2.5-flash (mocked)",
            round: request.round,
            status: "no_produce",
            message: uiCopy("copy.couldnTSpotAnyProduceClearlyMove", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
            produce: null,
            candidates: [],
            verdict: null,
            followUp: null,
            afterPurchase: null,
          },
        };
      }

      // Successful scans decrement daily scan quota
      mockRemainingScans = Math.max(0, mockRemainingScans - 1);

      if (request.round === 1) {
        // Round 1 mock: Watermelon pile with 2 candidates (winner & runner-up)
        // If focusPolygon was drawn, candidates fit inside it or central crop
        return {
          remainingScans: mockRemainingScans,
          response: {
            schemaVersion: "1.0",
            promptVersion: "v1",
            modelId: "gemini-2.5-flash (mocked)",
            round: 1,
            status: "ok",
            message: null,
            produce: {
              type: "watermelon",
              displayName: uiCopy("copy.watermelon", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
              variety: null,
            },
            candidates: [
              {
                id: "c1",
                box: [360, 240, 680, 560],
                score: 8.6,
                ripeness: "ripe",
                traits: [uiCopy("copy.creamyYellowGroundSpot", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"), uiCopy("copy.matteRind", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"), uiCopy("copy.heavyWebLines", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB")],
                flipSummary: null,
              },
              {
                id: "c2",
                box: [320, 580, 660, 900],
                score: 8.1,
                ripeness: "almost_ripe",
                traits: [uiCopy("copy.slightlyGlossyRind", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"), uiCopy("copy.smallFieldSpot", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB")],
                flipSummary: null,
              },
              {
                id: "c3",
                box: [180, 420, 440, 720],
                score: 7.2,
                ripeness: "underripe",
                traits: [uiCopy("copy.brightGlossyGreen", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"), uiCopy("copy.smallWhiteSpot", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB")],
                flipSummary: null,
              },
              {
                id: "c4",
                box: [620, 310, 880, 610],
                score: 6.8,
                ripeness: "underripe",
                traits: [uiCopy("copy.firmStripedRind", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"), uiCopy("copy.chalkyWhiteSpot", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB")],
                flipSummary: null,
              },
            ],
            verdict: {
              winnerId: "c1",
              runnerUpId: "c2",
              confidence: "high",
              headline: uiCopy("copy.buyThisOne", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
            },
            followUp: {
              targetCandidateId: "c2",
              targetRole: "runner_up",
              bannerText: uiCopy("copy.theBlueMarkedWatermelonCouldBeSweeter", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
              flipHeadline: uiCopy("copy.flipTheWatermelonOver", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
              instruction: uiCopy("copy.turnTheBlueMarkedWatermelonToShow", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
            },
            afterPurchase: {
              readyInDays: { min: 0, max: 0 },
              eatWithinDays: { min: 4, max: 6 },
              eatWithinLabel: uiCopy("copy.46Days", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
              storage: {
                beforeCut: {
                  where: "counter",
                  whereLabel: uiCopy("copy.counter", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
                  summary: uiCopy("copy.counterWhole", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
                  tip: uiCopy("copy.keepOutOfDirectSunlight", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
                },
                afterCut: {
                  where: "fridge",
                  whereLabel: uiCopy("copy.fridge", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
                  summary: uiCopy("copy.fridgeSealed", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
                  tip: uiCopy("copy.coverCutSurfaceWithWrapOrStore", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
                },
              },
            },
            seasonality: mockSeasonality(request),
          },
        };
      }

      if (request.round === 2) {
        // Round 2 mock: Runner-Up took the lead (9.0 beats 8.6)
        return {
          remainingScans: mockRemainingScans,
          response: {
            schemaVersion: "1.0",
            promptVersion: "v1",
            modelId: "gemini-2.5-flash (mocked)",
            round: 2,
            status: "ok",
            message: null,
            produce: {
              type: "watermelon",
              displayName: uiCopy("copy.watermelon", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
              variety: null,
            },
            candidates: [
              {
                id: "c2",
                box: [150, 150, 850, 850],
                score: 9.0,
                ripeness: "ripe",
                traits: [uiCopy("copy.deepButteryFieldSpot", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"), uiCopy("copy.richBrownWebbing", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"), uiCopy("copy.dullThudSkin", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB")],
                flipSummary: uiCopy("copy.deepCreamyFieldSpotWithExcellentWebbing", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
              },
            ],
            verdict: {
              winnerId: "c2",
              runnerUpId: "c1",
              confidence: "high",
              headline: uiCopy("copy.buyThisOne", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
            },
            followUp: {
              targetCandidateId: "c1",
              targetRole: "first_pick",
              bannerText: uiCopy("copy.1stWinner86WasOnlyGraded", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
              flipHeadline: uiCopy("copy.flipYour1stWinnerOver", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
              instruction: uiCopy("copy.turnTheYellowMarkedWatermelonToShow", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
            },
            afterPurchase: {
              readyInDays: { min: 0, max: 0 },
              eatWithinDays: { min: 4, max: 6 },
              eatWithinLabel: uiCopy("copy.46Days", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
              storage: {
                beforeCut: {
                  where: "counter",
                  whereLabel: uiCopy("copy.counter", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
                  summary: uiCopy("copy.counterWhole", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
                  tip: uiCopy("copy.roomTemperature", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
                },
                afterCut: {
                  where: "fridge",
                  whereLabel: uiCopy("copy.fridge", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
                  summary: uiCopy("copy.fridgeSealed", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
                  tip: uiCopy("copy.keepChilledInContainer", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
                },
              },
            },
            seasonality: mockSeasonality(request),
          },
        };
      }

      // Round 3 mock: 1st Winner reclaims the win (9.3 beats 9.0)
      return {
        remainingScans: mockRemainingScans,
        response: {
          schemaVersion: "1.0",
          promptVersion: "v1",
          modelId: "gemini-2.5-flash (mocked)",
          round: 3,
          status: "ok",
          message: null,
          produce: {
            type: "watermelon",
            displayName: uiCopy("copy.watermelon", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
            variety: null,
          },
          candidates: [
            {
              id: "c1",
              box: [150, 150, 850, 850],
              score: 9.3,
              ripeness: "ripe",
              traits: [uiCopy("copy.largeGoldenFieldSpot", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"), uiCopy("copy.heavyBeeStings", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"), uiCopy("copy.dryBrownStem", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB")],
              flipSummary: uiCopy("copy.vibrantGoldenGroundSpotWithExtensivePollination", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
            },
          ],
          verdict: {
            winnerId: "c1",
            runnerUpId: "c2",
            confidence: "high",
            headline: uiCopy("copy.buyYour1stWinner", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
          },
          followUp: null,
          afterPurchase: {
            readyInDays: { min: 0, max: 0 },
            eatWithinDays: { min: 4, max: 6 },
            eatWithinLabel: uiCopy("copy.46Days", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
            storage: {
              beforeCut: {
                where: "counter",
                whereLabel: uiCopy("copy.counter", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
                summary: uiCopy("copy.counterWhole", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
                tip: uiCopy("copy.roomTemperature", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
              },
              afterCut: {
                where: "fridge",
                whereLabel: uiCopy("copy.fridge", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
                summary: uiCopy("copy.fridgeSealed", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
                tip: uiCopy("copy.wrapTightly", undefined, isSupportedLocale(request.locale) ? request.locale : "en-GB"),
              },
            },
          },
          seasonality: mockSeasonality(request),
        },
      };
    },
  };
}
