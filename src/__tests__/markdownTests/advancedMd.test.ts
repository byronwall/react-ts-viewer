import { describe, it } from "vitest";
import { runScopeTreeSnapshotTest } from "../buildScopeTree/testUtils";

describe("Advanced Markdown File Test", () => {
  it("should match snapshot for advanced.md", () => {
    runScopeTreeSnapshotTest({
      snapshotIdentifier: "advancedMd",
      filePath: "advanced.md",
      isFixture: true,
    });
  });
});
