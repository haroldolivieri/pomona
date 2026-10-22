import { createProxyApp } from "./index";
import type { ScanTracing } from "./observability/scan-trace";

// The runtime supplies tracing; library/eval callers need no Cloudflare imports.
type FetchArgs = Parameters<ReturnType<typeof createProxyApp>["fetch"]>;
export default {
  fetch(...args: FetchArgs) {
    const context = args[2] as { tracing?: ScanTracing } | undefined;
    return createProxyApp({ tracing: context?.tracing }).fetch(...args);
  },
};
