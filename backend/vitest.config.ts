import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests share one Postgres database, so run files one at a time.
    fileParallelism: false,
  },
});
