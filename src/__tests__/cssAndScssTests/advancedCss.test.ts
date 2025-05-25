import { describe, it } from "vitest";
import { runScopeTreeSnapshotTest } from "../buildScopeTree/testUtils";

describe("Advanced CSS File Test", () => {
  it("should match snapshot for advanced.css", () => {
    runScopeTreeSnapshotTest({
      snapshotIdentifier: "advancedCss",
      filePath: "advanced.css",
      isFixture: true,
    });
  });
});
