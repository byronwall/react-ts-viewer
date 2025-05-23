import { describe, it } from "vitest";
import { runScopeTreeSnapshotTest } from "../buildScopeTree/testUtils";

describe("Markdown File Tests", () => {
  it("should match snapshot for sample.md", () => {
    runScopeTreeSnapshotTest({
      snapshotIdentifier: "sampleMd",
      filePath: "sample.md",
      isFixture: true,
    });
  });

  it("should match snapshot for another.md", () => {
    runScopeTreeSnapshotTest({
      snapshotIdentifier: "anotherMd",
      filePath: "another.md",
      isFixture: true,
    });
  });

  it("should match snapshot for empty.md", () => {
    runScopeTreeSnapshotTest({
      snapshotIdentifier: "emptyMd",
      filePath: "empty.md",
      isFixture: true,
    });
  });

  it("should match snapshot for advanced.md", () => {
    runScopeTreeSnapshotTest({
      snapshotIdentifier: "advancedMd",
      filePath: "advanced.md",
      isFixture: true,
    });
  });
});
