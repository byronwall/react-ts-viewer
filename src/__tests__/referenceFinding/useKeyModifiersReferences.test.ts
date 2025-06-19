import { describe, expect, it } from "vitest";

import { analyzeBOI } from "../../webview/Treemap/ref_graph/analyzeBOI";
import { createRefGraphObjs } from "./createRefGraphObjs";

describe("reference finder – useKeyModifiers.handleKeyDown", () => {
  it("should detect the expected external references", () => {
    const { focusNode, rootNode } = createRefGraphObjs();
    const { externalReferences } = analyzeBOI(focusNode, rootNode);

    // Snapshot just the external references (makes diffs clean)
    expect(externalReferences).toMatchSnapshot();
  });
});
