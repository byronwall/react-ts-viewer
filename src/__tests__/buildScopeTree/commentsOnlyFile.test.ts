import { describe, it } from "vitest";
import { runScopeTreeSnapshotTest } from "./testUtils";

describe("buildScopeTree - Comments Only File", () => {
  it("should handle a file with only comments", () => {
    runScopeTreeSnapshotTest({
      snapshotIdentifier: "commentsOnlyFile",
      filePath: "commentsOnly.tsx", // Mock file path
      isFixture: false,
      inlineContent: "// This is a comment\n/* Another comment */",
    });
  });
});
