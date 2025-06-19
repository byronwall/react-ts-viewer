import { describe, expect, it } from "vitest";

import { analyzeBOI } from "../../webview/Treemap/ref_graph/analyzeBOI";
import { resolveReferenceDeclarations } from "../../webview/Treemap/ref_graph/resolveReferenceDeclarations";
import { createRefGraphObjs } from "./createRefGraphObjs";

describe("reference declaration resolver – useKeyModifiers.handleKeyDown", () => {
  it("should map each external reference to its declaration", () => {
    const { focusNode, rootNode } = createRefGraphObjs();

    const { externalReferences } = analyzeBOI(focusNode, rootNode);

    const resolved = resolveReferenceDeclarations(externalReferences, rootNode);

    // Snapshot to keep output stable and easy to inspect
    expect(resolved).toMatchSnapshot();
  });
});
