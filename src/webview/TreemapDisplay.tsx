import React from "react";
// import { ResponsiveTreeMapCanvas, TreeMapDatum } from "@nivo/treemap"; // TreeMapDatum might not be exported
import { ResponsiveTreeMapCanvas } from "@nivo/treemap";
import { NodeCategory, ScopeNode } from "../types"; // Assuming src/types.ts
// import { vscode } from "./vscodeApi"; // Assuming you have a vscodeApi helper

// Helper to get VS Code API instance. You might have this in a dedicated file e.g. vscodeApi.ts
// Ensure this is initialized only once and used across your webview components.
let vscodeApiInstance: any;
function getVsCodeApi() {
  if (!vscodeApiInstance) {
    // @ts-expect-error - Standard VS Code webview API acquisition
    vscodeApiInstance = acquireVsCodeApi();
  }
  return vscodeApiInstance;
}
const vscode = getVsCodeApi();

interface TreemapDisplayProps {
  data: ScopeNode;
  // width: number; // Not needed if ResponsiveTreeMapCanvas is used correctly
  // height: number; // Not needed if ResponsiveTreeMapCanvas is used correctly
}

// Define a more specific type for Nivo node data if possible, or use any and cast
interface NivoNodeExtensions {
  data: ScopeNode; // We are sure node.data will be our ScopeNode
  // other Nivo specific properties if needed, like formattedValue, color etc.
}

const TreemapDisplay: React.FC<TreemapDisplayProps> = ({ data }) => {
  const handleNodeClick = (node: any) => {
    // Use 'any' or a more specific Nivo type if available
    const scopeNode = node.data as ScopeNode;
    if (scopeNode.loc && scopeNode.id) {
      const idParts = scopeNode.id.split(":");
      const filePath =
        idParts.length > 1 ? idParts.slice(0, -1).join(":") : idParts[0]; // Handles file paths with colons
      vscode.postMessage({
        command: "revealCode",
        filePath: filePath,
        loc: scopeNode.loc,
      });
    }
  };

  // Basic color scale based on category - extend as needed
  const categoryColors: Record<NodeCategory, string> = {
    [NodeCategory.Program]: "#1f77b4",
    [NodeCategory.Module]: "#aec7e8",
    [NodeCategory.Class]: "#ff7f0e",
    [NodeCategory.Function]: "#ffbb78",
    [NodeCategory.ArrowFunction]: "#2ca02c",
    [NodeCategory.Block]: "#98df8a",
    [NodeCategory.ControlFlow]: "#d62728",
    [NodeCategory.Variable]: "#ff9896",
    [NodeCategory.Call]: "#9467bd",
    [NodeCategory.ReactComponent]: "#c5b0d5",
    [NodeCategory.ReactHook]: "#8c564b",
    [NodeCategory.JSX]: "#c49c94",
    [NodeCategory.Other]: "#7f7f7f",
  };

  return (
    <ResponsiveTreeMapCanvas
      data={data}
      identity="id"
      value="value"
      valueFormat=".02s"
      leavesOnly={false}
      margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
      labelSkipSize={18}
      labelTextColor={{
        from: "color",
        modifiers: [["darker", 2]],
      }}
      // colors={{ scheme: "spectral" }} // Can use a scheme or a custom function
      colors={(nodeWithPossiblyOurData: any) => {
        const category = (nodeWithPossiblyOurData.data as ScopeNode)
          .category as NodeCategory;
        // Ensure a string is always returned, even if category is somehow not in categoryColors
        return (
          categoryColors[category] ||
          categoryColors[NodeCategory.Other as NodeCategory]
        );
      }}
      // colorBy="id" // Using custom colors function above
      borderColor={{
        from: "color",
        modifiers: [["darker", 0.8]],
      }}
      onClick={handleNodeClick}
      tooltip={({ node }: any) => {
        // Use 'any' for the destructured node
        const scopeNode = node.data as ScopeNode;
        return (
          <div
            style={{
              padding: "8px 12px",
              background: "white",
              color: "#333",
              border: "1px solid #ccc",
              borderRadius: "3px",
              fontSize: "12px",
              maxWidth: "400px",
            }}
          >
            <strong>{scopeNode.label}</strong> ({scopeNode.category})<br />
            Value: {node.formattedValue} ({scopeNode.value} chars)
            <br />
            Lines: {scopeNode.loc.start.line} - {scopeNode.loc.end.line}
            <br />
            <div
              style={{
                marginTop: "5px",
                paddingTop: "5px",
                borderTop: "1px solid #eee",
              }}
            >
              Source snippet (first 250 chars):
            </div>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                maxHeight: "100px",
                overflowY: "auto",
                background: "#f0f0f0",
                padding: "5px",
                marginTop: "3px",
              }}
            >
              {scopeNode.source.substring(0, 250)}
              {scopeNode.source.length > 250 ? "..." : ""}
            </pre>
          </div>
        );
      }}
    />
  );
};

export default TreemapDisplay;
