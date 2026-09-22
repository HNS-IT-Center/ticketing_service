import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "*.test.ts"],
    // Aborts the run if DATABASE_URL points at anything but this machine.
    setupFiles: ["./vitest.setup.ts"],
    // The integration suites share one Postgres database. Running the files in
    // parallel lets one suite create rows referencing another's fixtures —
    // handoverToRmaAction notifies every RMA and Administrator user, including
    // the ones auth.test.ts is about to delete — which made teardown flaky.
    fileParallelism: false,
  },
});
