import { describe, it, expect } from "vitest";
import { buildScopeTree } from "../../parsers/buildScopeTree";

describe("Value Calculation", () => {
  it("should calculate values correctly - leaf nodes have value 1, parents sum children", () => {
    const simpleCode = `
function test() {
  const a = 1;
  return a + 1;
}`;

    const tree = buildScopeTree("test.ts", simpleCode);

    // Root should have children
    expect(tree.children).toBeDefined();
    expect(tree.children!.length).toBeGreaterThan(0);

    // Find the function node
    const functionNode = tree.children!.find(
      (child) => child.category === "Function" && child.label.includes("test")
    );

    expect(functionNode).toBeDefined();
    expect(functionNode!.children).toBeDefined();
    expect(functionNode!.children!.length).toBeGreaterThan(0);

    // Function should have a value that's the sum of its children
    const childrenTotal = functionNode!.children!.reduce(
      (sum, child) => sum + child.value,
      0
    );
    const expectedValue = 1 + childrenTotal;
    expect(functionNode!.value).toBe(expectedValue);

    // Verify root value is sum of all its children
    const rootChildrenTotal = tree.children!.reduce(
      (sum, child) => sum + child.value,
      0
    );
    const rootExpectedValue = 1 + rootChildrenTotal;
    expect(tree.value).toBe(rootExpectedValue);

    // Root should have value > 1 (since it has children)
    expect(tree.value).toBeGreaterThan(1);
  });

  it("should handle leaf nodes with value 1", () => {
    const simpleCode = `const x = 42;`;

    const tree = buildScopeTree("test.ts", simpleCode);

    // Find a variable node (should be a leaf)
    const variableNode = tree.children!.find(
      (child) => child.category === "Variable"
    );

    if (
      variableNode &&
      (!variableNode.children || variableNode.children.length === 0)
    ) {
      // Leaf node should have value 1
      expect(variableNode.value).toBe(1);
    }
  });
});
