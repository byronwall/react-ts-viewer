import { describe, it } from "vitest";
import { runScopeTreeSnapshotTest } from "./testUtils";

describe("buildScopeTree - Simple Component", () => {
  it("should build a scope tree for a simple React component and match snapshot", () => {
    runScopeTreeSnapshotTest({
      snapshotIdentifier: "simpleComponent",
      filePath: "SimpleComponent.tsx",
      isFixture: true,
    });
  });
});
