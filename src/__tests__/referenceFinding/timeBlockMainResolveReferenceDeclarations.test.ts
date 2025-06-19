import { describe, expect, it } from "vitest";
import path from "path";

import { analyzeBOI } from "../../webview/Treemap/ref_graph/analyzeBOI";
import { resolveReferenceDeclarations } from "../../webview/Treemap/ref_graph/resolveReferenceDeclarations";
import { createRefGraphObjs } from "./createRefGraphObjs";

// New test focusing on the <main> JSX element inside the TimeBlock component.
describe("reference declaration resolver – TimeBlock.<main> element", () => {
  it("should map each external reference to its declaration", () => {
    const fixturePath = path.join(
      __dirname,
      "..",
      "__fixtures__",
      "TimeBlock.tsx"
    );

    // Locate the first <main> element within the TimeBlock component.
    const { focusNode, rootNode } = createRefGraphObjs(fixturePath, "<main>");

    const { externalReferences } = analyzeBOI(focusNode, rootNode);

    const resolved = resolveReferenceDeclarations(externalReferences, rootNode);

    // Snapshot keeps output stable and easy to inspect.
    expect(resolved).toMatchSnapshot();
  });
});
