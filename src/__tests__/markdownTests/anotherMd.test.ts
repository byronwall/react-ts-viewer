import { describe, it } from "vitest";
import { runScopeTreeSnapshotTest } from "../buildScopeTree/testUtils";

describe("Another Markdown File Test", () => {
  it("should match snapshot for another.md", () => {
    runScopeTreeSnapshotTest({
      snapshotIdentifier: "anotherMd",
      filePath: "another.md",
      isFixture: true,
    });
  });
});
