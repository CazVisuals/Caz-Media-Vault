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
    // Static binary assets are served directly and cannot be parsed by ESLint.
    "public/**/*.png",
    "public/**/*.jpg",
    "public/**/*.jpeg",
    "public/**/*.gif",
    "public/**/*.webp",
    "public/**/*.ico",
    // The production application now lives at the repository root. Keep the
    // previous app copy out of root CI so it cannot fail checks for code that
    // is not included in the container image.
    "apps/web/**",
  ]),
]);
