import { describe, it } from "vitest";
import { runScopeTreeSnapshotTest } from "./testUtils";

describe("buildScopeTree - Complex TSX", () => {
  it("should handle a more complex TSX file with various constructs", () => {
    runScopeTreeSnapshotTest({
      snapshotIdentifier: "ComplexExample",
      filePath: "ComplexExample.tsx",
      isFixture: true,
    });
  });
});
