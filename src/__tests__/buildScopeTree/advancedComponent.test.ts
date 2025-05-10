import { describe, it } from "vitest";
import { runScopeTreeSnapshotTest } from "./testUtils";

describe("buildScopeTree - AdvancedComponent (Fixture File)", () => {
  it("should build a scope tree from a fixture file and match snapshot", () => {
    runScopeTreeSnapshotTest({
      snapshotIdentifier: "AdvancedComponent",
      filePath: "AdvancedComponent.tsx",
      isFixture: true,
    });
  });
});
