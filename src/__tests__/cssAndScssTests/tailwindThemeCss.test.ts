import { describe, it } from "vitest";
import { runScopeTreeSnapshotTest } from "../buildScopeTree/testUtils";

describe("Tailwind Theme CSS File Test", () => {
  it("should match snapshot for tailwind-theme.css", () => {
    runScopeTreeSnapshotTest({
      snapshotIdentifier: "tailwindThemeCss",
      filePath: "tailwind-theme.css",
      isFixture: true,
    });
  });
});
