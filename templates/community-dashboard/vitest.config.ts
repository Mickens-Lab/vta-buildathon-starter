// Component tests (jsdom). The pure-module tests in test/*.test.ts stay on node:test (npm test runs both).
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  define: {
    __FARM__: "false",
    __TUNNEL__: "false",
    __VTA_BROWSER_URL__: JSON.stringify("http://vta.test"),
    __VTA_URL__: JSON.stringify("http://vta.test"),
    __VTC_BROWSER_URL__: JSON.stringify("http://vtc.test"),
    __VTC_URL__: JSON.stringify("http://vtc.test"),
    __FARM_INFO__: "null",
    __PIN__: JSON.stringify({ version: "0.0.0", imageTag: "0.0.0-test" }),
  },
  test: {
    environment: "jsdom",
    include: ["test/ui/**/*.test.tsx"],
    setupFiles: ["test/ui/setup.ts"],
    restoreMocks: false,
    testTimeout: 10_000,
  },
});
