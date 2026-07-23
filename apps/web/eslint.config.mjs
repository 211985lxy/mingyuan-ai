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
      // 管理后台/账号面板常见“挂载后拉数”模式；保持 warn，避免 --quiet CI 被存量代码堵死
      "react-hooks/set-state-in-effect": "warn",
      // 存量 WIP 文件仍依赖 @ts-nocheck；先降级为 warn，后续逐步拆除
      "@typescript-eslint/ban-ts-comment": "warn",
      "local/max-significant-lines-warning": ["warn", { max: 400 }],
      "max-lines": ["error", { max: 800, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ["src/app/api/integrations/wechat-mp/events/route.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["src/lib/aim-harness/planner.ts"],
    rules: {
      "@next/next/no-assign-module-variable": "off",
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
      // scrollRef 从 useAimWorkbench 返回后作为 ref prop 传递给 AimMessageStream,
      // 属合法用法;react-hooks@7 的 refs 规则对此误报,与上面两条同属拆分后的已知豁免。
      "react-hooks/refs": "off",
    },
  },
  {
    files: ["src/lib/wechat-html-convert.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // Knowledge categories have one canonical definition. Scope the guard to
    // the knowledge domain so unrelated category maps (for example AI HOT)
    // remain valid.
    files: [
      "src/app/api/admin/knowledge/**/*.ts",
      "src/app/api/knowledge/**/*.ts",
      "src/components/admin/knowledge-browser.tsx",
      "src/features/knowledge/**/*.{ts,tsx}",
      "src/lib/agent-logic-profile.ts",
      "src/lib/aim-knowledge-context.ts",
      "src/lib/aim/services/script-polish-context.ts",
      "src/lib/knowledge-auto-processor.ts",
    ],
    ignores: ["src/lib/knowledge-categories.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "VariableDeclarator[id.name='CATEGORY_LABELS']",
          message: "Import CATEGORY_LABELS from lib/knowledge-categories.ts.",
        },
        {
          selector: "VariableDeclarator[id.name='KNOWLEDGE_CATEGORY_LABELS']",
          message: "Import CATEGORY_LABELS from lib/knowledge-categories.ts.",
        },
        {
          selector: "VariableDeclarator[id.name='BROWSER_CATEGORY_LABELS']",
          message: "Import CATEGORY_LABELS from lib/knowledge-categories.ts.",
        },
        {
          selector: "VariableDeclarator[id.name='validCategories']",
          message: "Use KNOWLEDGE_CATEGORIES or isKnowledgeCategory from lib/knowledge-categories.ts.",
        },
      ],
    },
  },
]);

export default eslintConfig;
