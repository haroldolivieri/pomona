export interface TelemetryProvider {
  capture(event: string, properties?: Record<string, unknown>): void;
  identify(distinctId: string, traits?: Record<string, unknown>): void;
  captureException(error: unknown, context?: Record<string, unknown>): void;
}

export function createNoopTelemetry(): TelemetryProvider {
  return {
    capture: () => {},
    identify: () => {},
    captureException: () => {},
  };
}

export function createPostHogSentryTelemetry(options?: {
  posthogApiKey?: string;
  posthogHost?: string;
  sentryDsn?: string;
}): TelemetryProvider {
  // Graceful fallback to console / window objects when available
  return {
    capture(event, properties) {
      if (typeof window !== "undefined" && (window as any).posthog) {
        (window as any).posthog.capture(event, properties);
      }
    },
    identify(distinctId, traits) {
      if (typeof window !== "undefined" && (window as any).posthog) {
        (window as any).posthog.identify(distinctId, traits);
      }
    },
    captureException(error, context) {
      if (typeof window !== "undefined" && (window as any).Sentry) {
        (window as any).Sentry.captureException(error, { extra: context });
      }
    },
  };
}
