import globals from "globals"
import pluginJs from "@eslint/js"
import lint from "typescript-eslint"

/** @type {import('eslint').Linter.Config[]} */
export default [
  { files: ["**/*.{js,mjs,cjs,ts}"] },
  { languageOptions: { globals: globals.browser } },
  pluginJs.configs.recommended,
  ...lint.configs.strictTypeChecked,
  ...lint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-invalid-void-type": "off", // Can't figure out how to keep this, but have Deferred<void> be valid
      // stylisticTypeChecked customization
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      // Extras that I want
      "@typescript-eslint/no-unsafe-type-assertion": "error",
      "@typescript-eslint/prefer-destructuring": "error",
      "@typescript-eslint/prefer-readonly": "error",
      "@typescript-eslint/promise-function-async": "error",
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        { allowDefaultCaseForExhaustiveSwitch: true, considerDefaultExhaustiveForUnions: true },
      ],
      "@typescript-eslint/typedef": "error",
    },
  },
]
