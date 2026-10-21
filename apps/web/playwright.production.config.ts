import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir:"./e2e", testMatch:"**/*.production.spec.ts", workers:1,
  use:{baseURL:"http://localhost:8789",locale:"pt-BR",viewport:{width:393,height:852}},
  webServer:{command:"pnpm --filter @pomona/proxy exec wrangler dev --local --port 8789",url:"http://localhost:8789",reuseExistingServer:false,timeout:60000,env:{WRANGLER_SEND_METRICS:"false"}},
});
