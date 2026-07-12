import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { localRules } from "./eslint-local-rules.mjs";

const legacyLargeFiles = [
  "src/app/(dashboard)/create/page.tsx",
  "src/app/(dashboard)/aim/page.tsx",
  "src/app/(dashboard)/assets/page.tsx",
  "src/app/admin/knowledge/page.tsx",
  "src/lib/aim-agent-handlers.ts",
  "src/app/(dashboard)/topic-planning/page.tsx",
  "src/app/(dashboard)/competitor/page.tsx",
  "src/app/(dashboard)/videos/[[]id[]]/page.tsx",
  "src/app/admin/benchmark-profiles/page.tsx",
  "src/app/admin/benchmark-profiles/[id]/page.tsx",
  "__tests__/e2e/three-layer-flow.test.ts",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".agents/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    plugins: { local: localRules },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "local/max-significant-lines-warning": ["warn", { max: 400 }],
      "max-lines": ["error", { max: 800, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: legacyLargeFiles,
    rules: {
      "max-lines": "off",
    },
  },
  {
    files: ["src/app/(dashboard)/aim/page.tsx"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
  {
    files: ["src/lib/wechat-html-convert.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
