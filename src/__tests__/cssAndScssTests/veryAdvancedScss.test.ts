import { describe, it } from "vitest";
import { runScopeTreeSnapshotTest } from "../buildScopeTree/testUtils";

describe("Very Advanced SCSS File Test", () => {
  it("should match snapshot for veryAdvanced.scss", () => {
    runScopeTreeSnapshotTest({
      snapshotIdentifier: "veryAdvancedScss",
      filePath: "veryAdvanced.scss",
      isFixture: true,
    });
  });
});
