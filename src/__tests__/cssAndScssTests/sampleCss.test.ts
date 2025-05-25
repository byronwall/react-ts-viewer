import { describe, it } from "vitest";
import { runScopeTreeSnapshotTest } from "../buildScopeTree/testUtils";

describe("Sample CSS File Test", () => {
  it("should match snapshot for sample.css", () => {
    runScopeTreeSnapshotTest({
      snapshotIdentifier: "sampleCss",
      filePath: "sample.css",
      isFixture: true,
    });
  });
});
