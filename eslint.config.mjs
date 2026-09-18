// @ts-check
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "packages/shared/dist/**",
      "miniprogram-*/miniprogram/**",
      "miniprogram-*/node_modules/**",
      "miniprogram-*/miniprogram_npm/**",
      "cloudfunctions/*/shared/**",
      "cloudfunctions/*/src/shared/**",
      "cloudfunctions/*/index.js"
    ]
  },
  {
    files: ["**/*.ts"],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module"
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off"
    }
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
        __dirname: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly"
      }
    },
    rules: {
      "no-console": "off"
    }
  }
);
