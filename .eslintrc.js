module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint", "import", "unused-imports"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/recommended",
    "plugin:import/typescript",
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
    "@typescript-eslint/consistent-type-definitions": "off",
    "@typescript-eslint/consistent-type-imports": [
      "warn",
      {
        prefer: "type-imports",
        fixStyle: "inline-type-imports",
      },
    ],

    "import/order": [
      "warn",
      {
        "newlines-between": "always",
        groups: [
          "builtin",
          "external",
          "internal",
          "index",
          "sibling",
          "parent",
          "object",
          "type",
        ],
        alphabetize: {
          order: "asc",
          caseInsensitive: true,
        },
      },
    ],
    "import/no-duplicates": "warn",
    "import/newline-after-import": "warn",
    "import/no-unresolved": "warn",

    "sort-imports": ["warn", { ignoreCase: true, ignoreDeclarationSort: true }],

    // related to unused imports
    "@typescript-eslint/no-unused-vars": "off",
    "unused-imports/no-unused-imports": "error",
    "unused-imports/no-unused-vars": [
      "warn",
      {
        vars: "all",
        varsIgnorePattern: "^_",
        args: "after-used",
        argsIgnorePattern: "^_",
      },
    ],
  },
  settings: {
    "import/parsers": {
      "@typescript-eslint/parser": [".ts", ".tsx"],
    },
    "import/resolver": {
      node: {
        extensions: [".js", ".jsx", ".ts", ".tsx", ".d.ts"],
      },
    },
    "import/core-modules": ["vscode"],
    "editor.codeActionsOnSave": {
      "source.fixAll.eslint": true,
      "source.organizeImports": true,
    },
  },
  ignorePatterns: [
    ".eslintrc.js",
    "node_modules/",
    "dist/",
    "out/",
    ".vscode-test/",
    "**/*.test.ts", // Adjust if test files have different naming
    "**/runTest.ts",
    "**/__fixtures__/**",
  ],
  overrides: [
    {
      files: ["*.ts", "*.tsx"],
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: __dirname,
      },
    },
  ],
};
