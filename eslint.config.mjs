import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The production application now lives at the repository root. Keep the
    // previous app copy out of root CI so it cannot fail checks for code that
    // is not included in the container image.
    "apps/web/**",
  ]),
]);
