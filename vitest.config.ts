import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    // Aborts the run if DATABASE_URL points at anything but this machine.
    setupFiles: ["./vitest.setup.ts"],
  },
});
