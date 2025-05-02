module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
    project: ["./tsconfig.json"], // Point to your tsconfig.json
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    // 'plugin:@typescript-eslint/recommended-requiring-type-checking', // Enable if type-aware linting is desired (slower)
  ],
  env: {
    node: true,
    es6: true,
    mocha: true, // If using mocha for tests
  },
  rules: {
    // Basic rules
    semi: ["error", "always"],
    "no-unused-vars": "off", // Use @typescript-eslint/no-unused-vars instead
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/no-explicit-any": "warn", // Warn instead of error for 'any'
    "@typescript-eslint/explicit-module-boundary-types": "off", // Allow inferred return types
    "@typescript-eslint/no-non-null-assertion": "warn", // Warn on non-null assertions
    "no-console": "warn", // Allow console logs during development, but warn

    // VS Code specific rules (optional, good practices)
    "@typescript-eslint/no-floating-promises": "warn", // Catch unhandled promises
    "@typescript-eslint/naming-convention": [
      "warn",
      {
        selector: "interface",
        format: ["PascalCase"],
        custom: {
          regex: "^I[A-Z]",
          match: false, // Interfaces should not start with 'I'
        },
      },
    ],

    // Add more project-specific rules here
  },
  ignorePatterns: [
    "node_modules/",
    "dist/",
    "out/",
    ".vscode-test/",
    "**/*.test.ts", // Adjust if test files have different naming
    "**/runTest.ts",
  ],
};
