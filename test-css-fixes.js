const {
  buildScopeTreeCss,
} = require("./dist/parsers/css/buildScopeTreeCss.js");

// Test CSS content that had the }@layerbase issue
const testCss = `@layer base {
  :root {
    --background: 0 0% 100%;
  }
}
@layer base {
  * {
    @apply border-border;
  }
}`;

console.log("Testing CSS parsing fixes...");

try {
  const result = buildScopeTreeCss("test.css", testCss);

  console.log("✅ CSS parsing completed successfully");
  console.log("Root children count:", result.children.length);

  // Check if we have the expected @layer rules
  const layerRules = result.children.filter(
    (child) => child.label && child.label.includes("@layer")
  );

  console.log("✅ Found", layerRules.length, "@layer rules");

  // Check that no labels contain "}@layer"
  const hasClosebraceIssue = result.children.some(
    (child) => child.label && child.label.startsWith("}@")
  );

  if (hasClosebraceIssue) {
    console.log("❌ Still has closing brace issue");
  } else {
    console.log("✅ Closing brace issue fixed");
  }

  // Check for flattened blocks
  const hasBlockNodes = JSON.stringify(result).includes('"CssBlock"');
  if (hasBlockNodes) {
    console.log("❌ Still has Block nodes");
  } else {
    console.log("✅ Block nodes successfully flattened");
  }
} catch (error) {
  console.error("❌ CSS parsing failed:", error.message);
}
