import { describe, it } from "vitest";
import { runScopeTreeSnapshotTest } from "../buildScopeTree/testUtils";

describe("CSS and SCSS File Tests", () => {
  it("should match snapshot for sample.css", () => {
    runScopeTreeSnapshotTest({
      snapshotIdentifier: "sampleCss",
      filePath: "sample.css",
      isFixture: true,
    });
  });

  it("should match snapshot for sample.scss", () => {
    runScopeTreeSnapshotTest({
      snapshotIdentifier: "sampleScss",
      filePath: "sample.scss",
      isFixture: true,
    });
  });

  it("should match snapshot for advanced.css", () => {
    runScopeTreeSnapshotTest({
      snapshotIdentifier: "advancedCss",
      filePath: "advanced.css",
      isFixture: true,
    });
  });

  it("should match snapshot for advanced.scss", () => {
    runScopeTreeSnapshotTest({
      snapshotIdentifier: "advancedScss",
      filePath: "advanced.scss",
      isFixture: true,
    });
  });
});
