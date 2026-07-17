import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // Architecture guard: prevent category definition outside single source
    // Skip the canonical definition file itself
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: ["src/lib/knowledge-categories.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "VariableDeclarator[id.name='CATEGORY_LABELS']",
          message: "CATEGORY_LABELS must only be defined in lib/knowledge-categories.ts. Import from there instead.",
        },
        {
          selector: "VariableDeclarator[id.name='KNOWLEDGE_CATEGORY_LABELS']",
          message: "Use CATEGORY_LABELS from lib/knowledge-categories.ts instead of defining KNOWLEDGE_CATEGORY_LABELS.",
        },
        {
          selector: "VariableDeclarator[id.name='BROWSER_CATEGORY_LABELS']",
          message: "Use CATEGORY_LABELS from lib/knowledge-categories.ts instead of defining BROWSER_CATEGORY_LABELS.",
        },
        {
          selector: "VariableDeclarator[id.name='validCategories']",
          message: "Use KNOWLEDGE_CATEGORIES or isKnowledgeCategory from lib/knowledge-categories.ts instead of defining validCategories.",
        },
        {
          selector: "VariableDeclarator[id.name='CATEGORY_LIST']",
          message: "Use KNOWLEDGE_CATEGORIES from lib/knowledge-categories.ts instead of defining CATEGORY_LIST.",
        },
      ],
    },
  },
]);

export default eslintConfig;
