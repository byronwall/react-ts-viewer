import { describe, it } from "vitest";
import { runScopeTreeSnapshotTest } from "./testUtils";

describe("buildScopeTree - Empty File", () => {
  it("should handle an empty file", () => {
    runScopeTreeSnapshotTest({
      snapshotIdentifier: "emptyFile",
      filePath: "empty.tsx", // This is the mock file path passed to buildScopeTree
      isFixture: false,
      inlineContent: "",
    });
  });
});
