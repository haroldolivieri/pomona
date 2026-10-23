import { currentDisplayLocale } from "../i18n/copy";
import { uiCopy } from "../i18n/copy";
import {
  type ScanResponse,
  type Candidate,
  type Point,
  type ScanRequest,
  type ScanStatus,
  type TargetRipenessWindow,
  type DeepScanResponse,
  resolveCandidatesForTarget,
} from "@pomona/contract";
import { remapBoxFromCropToFrame, type CropRect } from "../lib/image-pipeline";

export type ScanPhase =
  | "S1_LiveCamera"
  | "S2_DrawFocusArea"
  | "S3_Analysing"
  | "S_ScanError"
  | "S4_InitialResult"
  | "S5A_FlipRunnerUpCamera"
  | "S5B1_RunnerUpBeaten"
  | "S5B2_RunnerUpTookLead"
  | "S6_FlipFirstPickCamera"
  | "S7A_FirstPickWonFinal"
  | "S7B_FirstPickLostFinal"
  | "S_DS_Capture"
  | "S_DS_Analysing"
  | "S_DS_Result";

export interface DeepScanComposite {
  dataUrl: string;
  tileCount: number;
}

export interface DeepScanSampleMeta {
  sampleCount: number;
  stats: { rejectedBlur: number; rejectedExposure: number; rejectedSimilarity: number };
}

export type DeepScanOrigin = "insufficient" | "tie" | "result_banner" | "debug";

export interface PreservedCandidate extends Candidate {
  initialScore: number;
  anglesInspected: number;
  role: "first_pick" | "runner_up";
}

export interface ScanMachineState {
  phase: ScanPhase;
  round: 1 | 2 | 3;
  status: ScanStatus | null;
  errorMessage: string | null;
  round1PhotoDataUrl: string | null;
  currentPhotoDataUrl: string | null;
  focusPolygon: Point[] | null;
  cropRect: CropRect | null;
  lastResponse: ScanResponse | null;
  firstPick: PreservedCandidate | null;
  runnerUp: PreservedCandidate | null;
  allCandidatesRound1: Candidate[];
  targetRipeness: TargetRipenessWindow;
  round1FollowUp: ScanResponse["followUp"] | null;
  dsOrigin: DeepScanOrigin | null;
  dsComposite: DeepScanComposite | null;
  dsSampleMeta: DeepScanSampleMeta | null;
  dsResult: DeepScanResponse | null;
}

export type ScanMachineAction =
  | { type: "FRAME_CAPTURED"; photoDataUrl: string }
  | {
      type: "START_ANALYSE";
      focusPolygon: Point[] | null;
      cropRect: CropRect | null;
    }
  | { type: "SCAN_SUCCEEDED"; response: ScanResponse }
  | { type: "SCAN_FAILED"; error: string }
  | { type: "DISMISS_ERROR" }
  | { type: "DRAW_FOCUS_AFTER_ERROR" }
  | { type: "SET_TARGET_RIPENESS"; targetRipeness: TargetRipenessWindow }
  | { type: "COMPARE_WITH_RUNNER_UP" }
  | { type: "FOLLOW_UP_CAPTURED"; photoDataUrl: string }
  | { type: "START_FINAL_CHECK_ON_FIRST_PICK" }
  | { type: "ENTER_DEEP_SCAN"; origin: DeepScanOrigin }
  | { type: "DS_CAPTURE_COMPLETED"; composite: DeepScanComposite; sampleCount: number; stats: DeepScanSampleMeta["stats"] }
  | { type: "DS_CAPTURE_REJECTED"; reason: "all_blurry" | "too_dark_or_bright" }
  | { type: "DS_SCAN_SUCCEEDED"; response: DeepScanResponse }
  | { type: "DS_SCAN_FAILED"; error: string }
  | { type: "DS_CANCEL" }
  | { type: "RESET" };

export function initialScanMachineState(): ScanMachineState {
  return {
    phase: "S1_LiveCamera",
    round: 1,
    status: null,
    errorMessage: null,
    round1PhotoDataUrl: null,
    currentPhotoDataUrl: null,
    focusPolygon: null,
    cropRect: null,
    lastResponse: null,
    firstPick: null,
    runnerUp: null,
    allCandidatesRound1: [],
    targetRipeness: "ready_now",
    round1FollowUp: null,
    dsOrigin: null,
    dsComposite: null,
    dsSampleMeta: null,
    dsResult: null,
  };
}

export function buildFollowUpRequestContext(
  state: ScanMachineState
): ScanRequest["followUpContext"] {
  if (!state.lastResponse || !state.lastResponse.followUp) {
    return null;
  }

  const { followUp, produce } = state.lastResponse;
  if (!produce || !state.firstPick || !state.runnerUp) {
    return null;
  }

  return {
    produceType: produce.type,
    produceDisplayName: produce.displayName,
    targetCandidateId: followUp.targetCandidateId,
    targetRole: followUp.targetRole,
    requestedInstruction: followUp.instruction,
    previousWinner: {
      id: state.firstPick.id,
      role: "first_pick",
      score: state.firstPick.score,
      ripeness: state.firstPick.ripeness,
      traits: state.firstPick.traits,
      anglesInspected: state.firstPick.anglesInspected,
    },
    previousRunnerUp: {
      id: state.runnerUp.id,
      role: "runner_up",
      score: state.runnerUp.score,
      ripeness: state.runnerUp.ripeness,
      traits: state.runnerUp.traits,
      anglesInspected: state.runnerUp.anglesInspected,
    },
    targetRipeness: state.targetRipeness,
  };
}

export function scanMachineReducer(
  state: ScanMachineState,
  action: ScanMachineAction
): ScanMachineState {
  switch (action.type) {
    case "RESET":
      return initialScanMachineState();

    case "ENTER_DEEP_SCAN":
      return {
        ...state,
        phase: "S_DS_Capture",
        dsOrigin: action.origin,
        dsComposite: null,
        dsSampleMeta: null,
        dsResult: null,
        errorMessage: null,
        status: null,
      };

    case "DS_CAPTURE_REJECTED":
      return {
        ...state,
        phase: "S_DS_Capture",
        errorMessage: uiCopy(
          action.reason === "too_dark_or_bright" ? "deepScan.localTooDark" : "deepScan.localTooBlurry",
          undefined,
          currentDisplayLocale()
        ),
      };

    case "DS_CAPTURE_COMPLETED":
      return {
        ...state,
        phase: "S_DS_Analysing",
        dsComposite: action.composite,
        dsSampleMeta: { sampleCount: action.sampleCount, stats: action.stats },
        errorMessage: null,
        status: null,
      };

    case "DS_SCAN_SUCCEEDED":
      return {
        ...state,
        phase: "S_DS_Result",
        dsResult: action.response,
        errorMessage: null,
        status: null,
      };

    case "DS_SCAN_FAILED":
      return {
        ...state,
        phase: "S_DS_Result",
        dsResult: null,
        status: "analysis_failed",
        errorMessage: action.error,
      };

    case "DS_CANCEL": {
      const originPhase: ScanPhase =
        state.dsOrigin === "tie"
          ? "S5B1_RunnerUpBeaten"
          : state.dsOrigin === "insufficient"
            ? "S_ScanError"
            : state.dsOrigin === "result_banner"
              ? "S4_InitialResult"
              : "S1_LiveCamera";
      return {
        ...state,
        phase: originPhase,
        dsComposite: null,
        dsSampleMeta: null,
        dsResult: null,
        errorMessage: null,
        status: null,
      };
    }

    case "FRAME_CAPTURED": {
      return {
        ...state,
        phase: "S2_DrawFocusArea",
        round: 1,
        errorMessage: null,
        status: null,
        round1PhotoDataUrl: action.photoDataUrl,
        currentPhotoDataUrl: action.photoDataUrl,
      };
    }

    case "START_ANALYSE": {
      return {
        ...state,
        phase: "S3_Analysing",
        errorMessage: null,
        status: null,
        focusPolygon: action.focusPolygon,
        cropRect: action.cropRect,
      };
    }

    case "FOLLOW_UP_CAPTURED": {
      return {
        ...state,
        phase: "S3_Analysing",
        errorMessage: null,
        status: null,
        currentPhotoDataUrl: action.photoDataUrl,
        focusPolygon: null,
        cropRect: null,
      };
    }

    case "SCAN_FAILED": {
      return {
        ...state,
        phase: "S_ScanError",
        status: "analysis_failed",
        errorMessage: action.error,
      };
    }

    case "DISMISS_ERROR": {
      return {
        ...state,
        phase: "S1_LiveCamera",
        status: null,
        errorMessage: null,
      };
    }

    case "DRAW_FOCUS_AFTER_ERROR": {
      return {
        ...state,
        phase: "S2_DrawFocusArea",
      };
    }

    case "SCAN_SUCCEEDED": {
      const resp = action.response;
      if (resp.status !== "ok") {
        return {
          ...state,
          phase: "S_ScanError",
          status: resp.status,
          errorMessage: resp.message || uiCopy("copy.produceAnalysisCouldNotBeCompleted"),
          lastResponse: resp,
        };
      }

      if (resp.round === 1) {
        // Remap candidate boxes if cropRect was present
        const remappedCandidates = resp.candidates.map((c) => {
          if (state.cropRect) {
            return {
              ...c,
              box: remapBoxFromCropToFrame(c.box, state.cropRect),
            };
          }
          return c;
        });

        // Find winner (firstPick) and runnerUp candidates
        const winnerId = resp.verdict?.winnerId;
        const runnerUpId = resp.verdict?.runnerUpId;

        const winnerCandidate = remappedCandidates.find((c) => c.id === winnerId) || remappedCandidates[0] || null;
        const runnerCandidate = remappedCandidates.find((c) => c.id === runnerUpId) ||
          remappedCandidates.find((c) => c.id !== winnerCandidate?.id) || null;

        const firstPick: PreservedCandidate | null = winnerCandidate
          ? {
              ...winnerCandidate,
              initialScore: winnerCandidate.score,
              anglesInspected: 1,
              role: "first_pick",
            }
          : null;

        const runnerUp: PreservedCandidate | null = runnerCandidate
          ? {
              ...runnerCandidate,
              initialScore: runnerCandidate.score,
              anglesInspected: 1,
              role: "runner_up",
            }
          : null;

        return {
          ...state,
          phase: "S4_InitialResult",
          round: 1,
          status: "ok",
          errorMessage: null,
          lastResponse: {
            ...resp,
            candidates: remappedCandidates,
          },
          firstPick,
          runnerUp,
          allCandidatesRound1: remappedCandidates,
          round1FollowUp: resp.followUp ?? null,
        };
      }

      if (resp.round === 2) {
        // Round 2 evaluated the Runner-Up flipped underside
        const targetCandidate = resp.candidates[0];
        const updatedRunnerScore = targetCandidate ? targetCandidate.score : (state.runnerUp?.score ?? 0);

        const updatedRunnerUp: PreservedCandidate | null = state.runnerUp
          ? {
              ...state.runnerUp,
              score: updatedRunnerScore,
              ripeness: targetCandidate?.ripeness ?? state.runnerUp.ripeness,
              traits: targetCandidate?.traits ?? state.runnerUp.traits,
              flipSummary: targetCandidate?.flipSummary ?? state.runnerUp.flipSummary,
              anglesInspected: 2,
            }
          : null;

        const firstPickScore = state.firstPick?.score ?? 0;
        // In Round 2: runnerUp must strictly beat 1st Pick score (runnerUpScore > firstPickScore) to take lead.
        // If tie (runnerUpScore === firstPickScore) or runnerUpScore < firstPickScore, Runner-Up was beaten.
        const runnerUpWon = updatedRunnerScore > firstPickScore;

        return {
          ...state,
          phase: runnerUpWon ? "S5B2_RunnerUpTookLead" : "S5B1_RunnerUpBeaten",
          round: 2,
          status: "ok",
          errorMessage: null,
          lastResponse: resp,
          runnerUp: updatedRunnerUp,
        };
      }

      if (resp.round === 3) {
        // Round 3 evaluated 1st Pick flipped underside for final check
        const targetCandidate = resp.candidates[0];
        const updatedFirstPickScore = targetCandidate ? targetCandidate.score : (state.firstPick?.score ?? 0);

        const updatedFirstPick: PreservedCandidate | null = state.firstPick
          ? {
              ...state.firstPick,
              score: updatedFirstPickScore,
              ripeness: targetCandidate?.ripeness ?? state.firstPick.ripeness,
              traits: targetCandidate?.traits ?? state.firstPick.traits,
              flipSummary: targetCandidate?.flipSummary ?? state.firstPick.flipSummary,
              anglesInspected: 2,
            }
          : null;

        const runnerUpScore = state.runnerUp?.score ?? 0;
        // In Round 3: 1st Pick reclaims win if firstPickScore >= runnerUpScore (tie goes to 1st pick).
        // Otherwise, 1st pick lost final check.
        const firstPickWon = updatedFirstPickScore >= runnerUpScore;

        return {
          ...state,
          phase: firstPickWon ? "S7A_FirstPickWonFinal" : "S7B_FirstPickLostFinal",
          round: 3,
          status: "ok",
          errorMessage: null,
          lastResponse: resp,
          firstPick: updatedFirstPick,
        };
      }

      return state;
    }

    case "SET_TARGET_RIPENESS": {
      if (state.phase !== "S4_InitialResult" || !state.lastResponse) {
        return state;
      }

      const resolution = resolveCandidatesForTarget(
        state.allCandidatesRound1,
        action.targetRipeness,
        currentDisplayLocale(),
      );

      const winnerCandidate = resolution.winner;
      const runnerCandidate = resolution.runnerUp;

      const firstPick: PreservedCandidate | null = winnerCandidate
        ? {
            ...winnerCandidate,
            initialScore: winnerCandidate.score,
            anglesInspected: 1,
            role: "first_pick",
          }
        : null;

      const runnerUp: PreservedCandidate | null = runnerCandidate
        ? {
            ...runnerCandidate,
            initialScore: runnerCandidate.score,
            anglesInspected: 1,
            role: "runner_up",
          }
        : null;

      const updatedVerdict = state.lastResponse?.verdict
        ? {
            ...state.lastResponse.verdict,
            winnerId: winnerCandidate?.id ?? state.lastResponse.verdict.winnerId,
            runnerUpId: runnerCandidate?.id ?? null,
            headline: resolution.headlineKind === "buy" ? uiCopy("copy.bestAvailable") : resolution.headline,
          }
        : null;

      const bannerText = action.targetRipeness === "ready_now"
        ? (state.round1FollowUp?.bannerText || resolution.followUpHintOverride || state.lastResponse.followUp?.bannerText || uiCopy("copy.theBlueOneCouldBeSweeterFlip"))
        : (resolution.followUpHintOverride || state.lastResponse.followUp?.bannerText || uiCopy("copy.checkUndersideBeforeStoring"));

      const updatedFollowUp = state.lastResponse?.followUp && runnerCandidate
        ? {
            ...state.lastResponse.followUp,
            targetCandidateId: runnerCandidate.id,
            targetRole: "runner_up" as const,
            bannerText,
          }
        : state.lastResponse?.followUp ?? null;

      // Update candidates list with target-specific contextual scores so all candidates reflect the target ripeness window
      const updatedCandidates = state.lastResponse?.candidates.map((c) => {
        const matchingRanked = resolution.rankedCandidates.find((rc) => rc.id === c.id);
        return matchingRanked ? { ...c, score: matchingRanked.score } : c;
      }) ?? state.lastResponse?.candidates ?? [];

      return {
        ...state,
        targetRipeness: action.targetRipeness,
        firstPick,
        runnerUp,
        lastResponse: state.lastResponse
          ? {
              ...state.lastResponse,
              candidates: updatedCandidates,
              verdict: updatedVerdict,
              followUp: updatedFollowUp,
            }
          : null,
      };
    }

    case "COMPARE_WITH_RUNNER_UP": {
      return {
        ...state,
        phase: "S5A_FlipRunnerUpCamera",
        round: 2,
        errorMessage: null,
      };
    }

    case "START_FINAL_CHECK_ON_FIRST_PICK": {
      return {
        ...state,
        phase: "S6_FlipFirstPickCamera",
        round: 3,
        errorMessage: null,
      };
    }

    default:
      return state;
  }
}
