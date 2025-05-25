import { describe, it } from "vitest";
import { runScopeTreeSnapshotTest } from "../buildScopeTree/testUtils";

describe("Empty Markdown File Test", () => {
  it("should match snapshot for empty.md", () => {
    runScopeTreeSnapshotTest({
      snapshotIdentifier: "emptyMd",
      filePath: "empty.md",
      isFixture: true,
    });
  });
});
