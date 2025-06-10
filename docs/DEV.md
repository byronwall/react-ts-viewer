# Development Guide

This document contains development setup instructions, testing guidelines, and contribution information for the React TypeScript Code Analysis VS Code Extension.

## Development Setup

- Run `npm install` to install dependencies.
- Run `npm run watch` to start the TypeScript compiler in watch mode.
- Open the project in VS Code and press `F5` to launch the Extension Development Host.

## Testing

This project uses **Vitest** for testing with a focus on snapshot testing to verify code parsing accuracy across different file types.

### Testing Philosophy

The testing approach centers around **scope tree snapshot testing**, where files are parsed into hierarchical tree structures and compared against saved snapshots. This ensures that:

- Code parsing logic remains consistent
- Changes to parsers are intentional and visible
- Different file types (TypeScript, CSS, Markdown) are properly analyzed

### Directory Structure

```
src/__tests__/
├── __fixtures__/              # Shared fixture files for all tests
│   ├── sample.css
│   ├── advanced.scss
│   ├── SimpleComponent.tsx
│   ├── sample.md
│   └── tailwind-theme.css
├── buildScopeTree/             # Core parser tests
│   ├── testUtils.ts           # Testing utilities
│   ├── complexExample.test.ts
│   ├── simpleComponent.test.ts
│   └── __snapshots__/
├── cssAndScssTests/           # CSS/SCSS specific tests
│   ├── cssAndScss.test.ts
│   └── __snapshots__/
└── markdownTests/             # Markdown specific tests
    ├── markdown.test.ts
    └── __snapshots__/
```

### Running Tests

- **Watch mode** (reruns on file changes):

  ```bash
  npm test
  ```

- **Run once and exit**:

  ```bash
  npm run test:once
  ```

- **Update snapshots** for existing tests:

  ```bash
  npm run test:once -- -u
  ```

- **Run specific test file**:

  ```bash
  npm run test:once -- cssAndScss.test.ts
  ```

### Adding New Tests

#### 1. Using Fixture Files (Recommended)

**Step 1:** Create a fixture file in `src/__tests__/__fixtures__/`

```bash
# Example: Create a new CSS theme file
touch src/__tests__/__fixtures__/my-theme.css
```

**Step 2:** Add your content to the fixture file

```css
/* src/__tests__/__fixtures__/my-theme.css */
:root {
  --primary: #007acc;
  --secondary: #f0f0f0;
}
```

**Step 3:** Add a test case to the appropriate test file

```typescript
// In src/__tests__/cssAndScssTests/cssAndScss.test.ts
it("should match snapshot for my-theme.css", () => {
  runScopeTreeSnapshotTest({
    snapshotIdentifier: "myThemeCss",
    filePath: "my-theme.css",
    isFixture: true,
  });
});
```

#### 2. Using Inline Content

For smaller tests or dynamic content:

```typescript
it("should handle inline CSS", () => {
  runScopeTreeSnapshotTest({
    snapshotIdentifier: "inlineCss",
    filePath: "virtual-file.css",
    isFixture: false,
    inlineContent: `
      .test { color: red; }
      .another { margin: 10px; }
    `,
  });
});
```

### Test Utility API

The `runScopeTreeSnapshotTest` function supports:

```typescript
runScopeTreeSnapshotTest({
  snapshotIdentifier: string;    // Unique identifier for the snapshot
  filePath: string;              // For fixtures: filename, for inline: mock path
  isFixture?: boolean;           // true = use fixture file, false = use inlineContent
  inlineContent?: string;        // Required when isFixture is false
});
```

### Supported File Types

The testing framework currently supports:

- **TypeScript/TSX**: React components, hooks, utilities
- **CSS/SCSS**: Stylesheets, themes, component styles
- **Markdown**: Documentation, README files

### Best Practices

1. **Use descriptive snapshot identifiers**: `tailwindThemeCss`, `complexReactComponent`, etc.
2. **Group related tests**: Keep CSS tests in `cssAndScssTests/`, components in `buildScopeTree/`
3. **Shared fixtures**: Place reusable test files in `src/__tests__/__fixtures__/`
4. **Meaningful test names**: Describe what the test is validating
5. **Review snapshots**: Always review generated snapshots to ensure they capture the expected structure

### Example: Adding a New Component Test

```typescript
// 1. Create fixture: src/__tests__/__fixtures__/MyButton.tsx
import React from 'react';

interface Props {
  label: string;
  onClick: () => void;
}

export const MyButton: React.FC<Props> = ({ label, onClick }) => {
  return <button onClick={onClick}>{label}</button>;
};

// 2. Add test: src/__tests__/buildScopeTree/myButton.test.ts
import { describe, it } from "vitest";
import { runScopeTreeSnapshotTest } from "./testUtils";

describe("MyButton Component", () => {
  it("should parse button component structure", () => {
    runScopeTreeSnapshotTest({
      snapshotIdentifier: "MyButton",
      filePath: "MyButton.tsx",
      isFixture: true,
    });
  });
});

// 3. Run the test to generate snapshot
// npm run test:once -- myButton.test.ts
```

## Contributing

Contributions are welcome! Please follow the testing guidelines above when adding new features or fixing bugs. Make sure to:

1. Add appropriate tests for new functionality
2. Update snapshots when parser behavior changes intentionally
3. Follow the existing code style and structure
4. Document any new features in the main README.md
