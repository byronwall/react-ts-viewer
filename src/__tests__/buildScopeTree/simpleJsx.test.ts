import { describe, it } from "vitest";
import { runScopeTreeSnapshotTest } from "./testUtils";

// New test: simple JSX element file

describe("buildScopeTree - simpleJsx", () => {
  it("should build a scope tree for the simpleJsx fixture and match snapshot", () => {
    runScopeTreeSnapshotTest({
      snapshotIdentifier: "simpleJsx",
      filePath: "simpleJsx.tsx",
      isFixture: true,
    });
  });
});
