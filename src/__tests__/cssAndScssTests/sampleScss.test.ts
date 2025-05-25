import { describe, it } from "vitest";
import { runScopeTreeSnapshotTest } from "../buildScopeTree/testUtils";

describe("Sample SCSS File Test", () => {
  it("should match snapshot for sample.scss", () => {
    runScopeTreeSnapshotTest({
      snapshotIdentifier: "sampleScss",
      filePath: "sample.scss",
      isFixture: true,
    });
  });
});
