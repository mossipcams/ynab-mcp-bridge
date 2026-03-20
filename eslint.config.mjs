import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import securityPlugin from "eslint-plugin-security";
import sonarjsPlugin from "eslint-plugin-sonarjs";
import globals from "globals";

const NON_TYPED_TS_IGNORES = [
  "src/**/*.spec.ts",
  "src/**/*.contract.ts",
];

const TYPE_CHECKED_FILES = [
  "src/*.ts",
  "src/clientProfiles/**/*.ts",
];

const TYPE_CHECKED_IGNORES = [
  ...NON_TYPED_TS_IGNORES,
  "src/httpServer.ts",
  "src/index.ts",
  "src/server.ts",
  "src/stdioServer.ts",
];

const baseTypeScriptConfigs = [
  ...tsPlugin.configs["flat/recommended"],
  ...tsPlugin.configs["flat/strict"],
].map((config) => ({
  ...config,
  files: ["**/*.ts"],
  ignores: NON_TYPED_TS_IGNORES,
}));

const typeCheckedConfigs = [
  ...tsPlugin.configs["flat/recommended-type-checked"],
  ...tsPlugin.configs["flat/strict-type-checked"],
].map((config) => ({
  ...config,
  files: TYPE_CHECKED_FILES,
  ignores: TYPE_CHECKED_IGNORES,
}));

export default [
  {
    ignores: [
      "artifacts/**",
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
  ...baseTypeScriptConfigs,
  // strictTypeChecked rules come from the TypeScript ESLint flat strict preset.
  ...typeCheckedConfigs,
  {
    files: ["**/*.ts"],
    ignores: NON_TYPED_TS_IGNORES,
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parser: tsParser,
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/consistent-type-assertions": ["error", {
        assertionStyle: "never",
      }],
      "@typescript-eslint/no-dynamic-delete": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      }],
      "@typescript-eslint/require-await": "off",
    },
  },
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
      "@typescript-eslint/consistent-type-assertions": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/unbound-method": "off",
    },
  },
  {
    files: ["src/*.ts"],
    ignores: TYPE_CHECKED_IGNORES,
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["src/clientProfiles/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.eslint.clientProfiles.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: TYPE_CHECKED_FILES,
    ignores: TYPE_CHECKED_IGNORES,
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parser: tsParser,
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
        assertionStyle: "never",
      }],
      "@typescript-eslint/no-dynamic-delete": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
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
