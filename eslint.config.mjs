import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import globals from "globals";

const typeCheckedConfigs = [
  ...tsPlugin.configs["flat/recommended-type-checked"],
  ...tsPlugin.configs["flat/strict-type-checked"],
].map((config) => ({
  ...config,
  files: ["**/*.ts"],
}));

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "src/**/*.spec.ts",
      "vitest.config.ts",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  // strictTypeChecked rules come from the TypeScript ESLint flat strict preset.
  ...typeCheckedConfigs,
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-dynamic-delete": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      }],
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/restrict-template-expressions": ["error", {
        allowNumber: true,
      }],
    },
  },
];
