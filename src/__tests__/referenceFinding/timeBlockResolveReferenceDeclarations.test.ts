import { describe, expect, it } from "vitest";
import path from "path";

import { analyzeBOI } from "../../webview/Treemap/ref_graph/analyzeBOI";
import { resolveReferenceDeclarations } from "../../webview/Treemap/ref_graph/resolveReferenceDeclarations";
import { createRefGraphObjs } from "./createRefGraphObjs";

describe("reference declaration resolver – TimeBlock.handleMouseDown", () => {
  it("should map each external reference to its declaration", () => {
    const fixturePath = path.join(
      __dirname,
      "..",
      "__fixtures__",
      "TimeBlock.tsx"
    );

    const { focusNode, rootNode } = createRefGraphObjs(
      fixturePath,
      "handleMouseDown"
    );

    const { externalReferences } = analyzeBOI(focusNode, rootNode);

    const resolved = resolveReferenceDeclarations(externalReferences, rootNode);

    // Snapshot to keep output stable and easy to inspect
    expect(resolved).toMatchSnapshot();
  });
});
