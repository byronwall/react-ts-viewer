import { describe, expect, it } from "vitest";

import { analyzeBOI } from "../../webview/Treemap/ref_graph/analyzeBOI";
import { createRefGraphObjs } from "./createRefGraphObjs";
import path from "path";

describe("reference finder – useKeyModifiers.handleKeyDown", () => {
  it("should detect the expected external references", () => {
    const fixturePath = path.join(
      __dirname,
      "..",
      "__fixtures__",
      "useKeyModifiers.tsx"
    );

    const { focusNode, rootNode } = createRefGraphObjs(
      fixturePath,
      "handleKeyDown"
    );
    const { externalReferences } = analyzeBOI(focusNode, rootNode);

    // Snapshot just the external references (makes diffs clean)
    expect(externalReferences).toMatchSnapshot();
  });
});
