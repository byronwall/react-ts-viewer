import { describe, it } from "vitest";
import { runScopeTreeSnapshotTest } from "../buildScopeTree/testUtils";

describe("Sample Markdown File Test", () => {
  it("should match snapshot for sample.md", () => {
    runScopeTreeSnapshotTest({
      snapshotIdentifier: "sampleMd",
      filePath: "sample.md",
      isFixture: true,
    });
  });
});
