import { describe, it, expect } from "vitest";
import { buildScopeTree } from "../../parsers/buildScopeTree";

describe("CSS Comments Toggle Test", () => {
  const cssContent = `
/* This is a comment */
.container {
  /* Another comment */
  color: red;
  background: blue;
}

/* Final comment */
.button {
  padding: 10px;
}
`;

  it("should include comments when includeComments is true", () => {
    const result = buildScopeTree("test.css", cssContent, {
      includeComments: true,
    });

    // Should have comments in the tree
    const hasComments = JSON.stringify(result).includes("CssComment");
    expect(hasComments).toBe(true);
  });

  it("should exclude comments when includeComments is false", () => {
    const result = buildScopeTree("test.css", cssContent, {
      includeComments: false,
    });

    // Should not have comments in the tree
    const hasComments = JSON.stringify(result).includes("CssComment");
    expect(hasComments).toBe(false);
  });

  it("should exclude comments by default when includeComments is not specified", () => {
    const result = buildScopeTree("test.css", cssContent, {});

    // Should not have comments in the tree by default
    const hasComments = JSON.stringify(result).includes("CssComment");
    expect(hasComments).toBe(false);
  });
});
