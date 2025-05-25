import { describe, it } from "vitest";
import { runScopeTreeSnapshotTest } from "../buildScopeTree/testUtils";

describe("Advanced SCSS File Test", () => {
  it("should match snapshot for advanced.scss", () => {
    runScopeTreeSnapshotTest({
      snapshotIdentifier: "advancedScss",
      filePath: "advanced.scss",
      isFixture: true,
    });
  });
});
