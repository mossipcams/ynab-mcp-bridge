import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import securityPlugin from "eslint-plugin-security";
import sonarjsPlugin from "eslint-plugin-sonarjs";
import globals from "globals";

const typeCheckedConfigs = [
  ...tsPlugin.configs["flat/recommended-type-checked"],
  ...tsPlugin.configs["flat/strict-type-checked"],
].map((config) => ({
  ...config,
  files: ["**/*.ts"],
  ignores: ["src/**/*.spec.ts"],
}));

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
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
    files: ["src/**/*.spec.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
        afterAll: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        beforeEach: "readonly",
        describe: "readonly",
        expect: "readonly",
        it: "readonly",
        test: "readonly",
        vi: "readonly",
      },
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.test.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/unbound-method": "off",
    },
  },
  {
    files: ["**/*.ts"],
    ignores: ["src/**/*.spec.ts"],
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
    plugins: {
      security: securityPlugin,
      sonarjs: sonarjsPlugin,
    },
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["dist", "dist/*", "./dist/*", "../dist/*"],
          message: "Import source files instead of built output.",
        }],
      }],
      "no-unused-vars": "off",
      "@typescript-eslint/consistent-type-assertions": ["error", {
        assertionStyle: "as",
      }],
      "@typescript-eslint/no-dynamic-delete": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
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
      "max-depth": ["error", 3],
      "max-params": ["error", 4],
      "sonarjs/cognitive-complexity": ["error", 10],
    },
  },
  {
    files: ["src/{config,server}.ts"],
    rules: {
      "@typescript-eslint/explicit-function-return-type": ["error", {
        allowExpressions: true,
        allowHigherOrderFunctions: true,
        allowTypedFunctionExpressions: true,
      }],
    },
  },
];
