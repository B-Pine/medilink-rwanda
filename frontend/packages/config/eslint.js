/**
 * Shared ESLint flat config for the MediLink frontend workspace.
 *
 * Security and accessibility rules here are acceptance criteria (Sprint 0 contract F3, F5, F6):
 *  - `react/no-danger` is an error (no dangerouslySetInnerHTML), innerHTML/outerHTML writes are banned
 *  - sessionStorage is banned; localStorage is allowed only in the UI preferences module (theme, language)
 *  - jsx-a11y strict
 *  - medilink/no-literal-jsx-text: no hard-coded user-facing text in JSX
 */
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import prettier from "eslint-config-prettier";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

import noLiteralJsxText from "./eslint-rules/no-literal-jsx-text.js";

const medilinkPlugin = {
  meta: { name: "eslint-plugin-medilink" },
  rules: { "no-literal-jsx-text": noLiteralJsxText },
};

/** Files allowed to use localStorage (non-sensitive UI preferences only, never tokens). */
const PREFERENCE_STORAGE_FILES = ["packages/ui/src/preferences/storage.ts"];

/**
 * @param {{ rootDir: string }} options
 */
export function medilinkEslintConfig({ rootDir }) {
  return defineConfig(
    {
      ignores: [
        "**/node_modules/**",
        "**/dist/**",
        "**/dev-dist/**",
        "**/coverage/**",
        "**/public/mockServiceWorker.js",
        "**/*.d.ts",
      ],
    },
    js.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    {
      languageOptions: {
        ecmaVersion: 2023,
        sourceType: "module",
        globals: { ...globals.browser, ...globals.node },
        parserOptions: { projectService: true, tsconfigRootDir: rootDir },
      },
      linterOptions: { reportUnusedDisableDirectives: "error" },
    },
    {
      files: ["**/*.{ts,tsx}"],
      ...react.configs.flat.recommended,
      ...react.configs.flat["jsx-runtime"],
      settings: { react: { version: "19.3" } },
    },
    {
      files: ["**/*.{ts,tsx}"],
      ...reactHooks.configs.flat.recommended,
    },
    {
      files: ["**/*.{ts,tsx}"],
      ...jsxA11y.flatConfigs.strict,
    },
    {
      files: ["**/*.{ts,tsx}"],
      plugins: { medilink: medilinkPlugin },
      rules: {
        // Security (docs/security/06-application-and-api-security.md §6)
        "react/no-danger": "error",
        "react/no-danger-with-children": "error",
        "no-eval": "error",
        "no-implied-eval": "error",
        "no-new-func": "error",
        "no-restricted-globals": [
          "error",
          {
            name: "sessionStorage",
            message: "Do not use sessionStorage (no tokens or personal data in browser storage).",
          },
          {
            name: "localStorage",
            message: "Only the UI preferences module may use localStorage (theme, language).",
          },
        ],
        "no-restricted-properties": [
          "error",
          { object: "window", property: "sessionStorage", message: "Do not use sessionStorage." },
          {
            object: "window",
            property: "localStorage",
            message: "Only the UI preferences module may use localStorage.",
          },
        ],
        "no-restricted-syntax": [
          "error",
          {
            selector:
              "AssignmentExpression > MemberExpression.left[property.name=/^(innerHTML|outerHTML)$/]",
            message: "Do not write innerHTML/outerHTML; render with React.",
          },
          {
            selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
            message: "Do not use insertAdjacentHTML; render with React.",
          },
        ],

        // i18n: no hard-coded user-facing text (contract F3)
        "medilink/no-literal-jsx-text": "error",

        // TypeScript
        "@typescript-eslint/consistent-type-imports": [
          "error",
          { fixStyle: "inline-type-imports" },
        ],
        "@typescript-eslint/no-misused-promises": [
          "error",
          { checksVoidReturn: { attributes: false } },
        ],
        "@typescript-eslint/no-unused-vars": [
          "error",
          { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
        ],

        // React
        "react/prop-types": "off",
        "react/jsx-no-target-blank": "error",
      },
    },
    {
      files: PREFERENCE_STORAGE_FILES,
      rules: { "no-restricted-globals": "off", "no-restricted-properties": "off" },
    },
    {
      // Tests may read and reset storage (they assert that nothing sensitive is stored).
      files: ["**/*.test.{ts,tsx}", "**/test/**/*.{ts,tsx}"],
      rules: {
        "no-restricted-globals": "off",
        "no-restricted-properties": "off",
        "medilink/no-literal-jsx-text": "off",
        "@typescript-eslint/no-non-null-assertion": "off",
        "@typescript-eslint/unbound-method": "off",
      },
    },
    {
      files: ["**/*.{js,mjs,cjs}"],
      extends: [tseslint.configs.disableTypeChecked],
    },
    prettier,
  );
}

export default medilinkEslintConfig;
