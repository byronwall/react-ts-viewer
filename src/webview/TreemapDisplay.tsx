import React from "react";
// import { ResponsiveTreeMapCanvas, TreeMapDatum } from "@nivo/treemap"; // TreeMapDatum might not be exported
import { ResponsiveTreeMap } from "@nivo/treemap";
import { NodeCategory, ScopeNode } from "../types"; // Assuming src/types.ts
import { vscodeApi } from "./vscodeApi"; // Import the shared vscodeApi singleton

// Remove the standalone vscode API implementation - use the imported singleton instead
// let vscodeApiInstance: any;
// function getVsCodeApi() {
//   if (!vscodeApiInstance) {
//     // @ts-expect-error - Standard VS Code webview API acquisition
//     vscodeApiInstance = acquireVsCodeApi();
//   }
//   return vscodeApiInstance;
// }
// const vscode = getVsCodeApi();

interface TreemapSettings {
  tile: "squarify" | "binary" | "dice" | "slice" | "sliceDice";
  leavesOnly: boolean;
  innerPadding: number;
  outerPadding: number;
  enableLabel: boolean;
  labelSkipSize: number;
  nodeOpacity: number;
  borderWidth: number;
  // Tooltip settings
  enableTooltip: boolean;
  showTooltipId: boolean;
  showTooltipCategory: boolean;
  showTooltipValue: boolean;
  showTooltipLines: boolean;
  showTooltipSourceSnippet: boolean;
  tooltipSourceSnippetLength: number;
}

interface TreemapDisplayProps {
  data: ScopeNode;
  settings: TreemapSettings;
  // width: number; // Not needed if ResponsiveTreeMapCanvas is used correctly
  // height: number; // Not needed if ResponsiveTreeMapCanvas is used correctly
}

// Define a more specific type for Nivo node data if possible, or use any and cast
interface NivoNodeExtensions {
  data: ScopeNode; // We are sure node.data will be our ScopeNode
  // other Nivo specific properties if needed, like formattedValue, color etc.
}

const TreemapDisplay: React.FC<TreemapDisplayProps> = ({ data, settings }) => {
  const handleNodeClick = (node: any) => {
    const scopeNode = node.data as ScopeNode;
    if (scopeNode.loc && scopeNode.id) {
      const idParts = scopeNode.id.split(":");
      const filePath =
        idParts.length > 1 ? idParts.slice(0, -1).join(":") : idParts[0];
      vscodeApi.postMessage({
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
    <ResponsiveTreeMap
      data={data}
      identity="id"
      value="value"
      valueFormat=".02s"
      margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
      labelTextColor={{
        from: "color",
        modifiers: [["darker", 2]],
      }}
      parentLabel={(node) =>
        `${node.data.category} [${node.data.loc.start.line}-${node.data.loc.end.line}]`
      }
      colors={(nodeWithPossiblyOurData: any) => {
        const category = (nodeWithPossiblyOurData.data as ScopeNode)
          .category as NodeCategory;
        return (
          categoryColors[category] ||
          categoryColors[NodeCategory.Other as NodeCategory]
        );
      }}
      borderColor={{
        from: "color",
        modifiers: [["darker", 0.8]],
      }}
      onClick={handleNodeClick}
      tooltip={
        settings.enableTooltip
          ? ({ node }: any) => {
              const scopeNode = node.data as ScopeNode;
              const snippetLength = Math.max(
                0,
                settings.tooltipSourceSnippetLength
              );
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
                    boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
                  }}
                >
                  {settings.showTooltipId && (
                    <>
                      <strong>{scopeNode.id.split(":").pop()}</strong>
                      {settings.showTooltipCategory &&
                        ` (${scopeNode.category})`}
                      <br />
                    </>
                  )}
                  {!settings.showTooltipId && settings.showTooltipCategory && (
                    <>
                      <strong>{scopeNode.category}</strong>
                      <br />
                    </>
                  )}
                  {settings.showTooltipValue && (
                    <>
                      Value: {node.formattedValue} ({scopeNode.value} chars)
                      <br />
                    </>
                  )}
                  {settings.showTooltipLines && (
                    <>
                      Lines: {scopeNode.loc.start.line} -{" "}
                      {scopeNode.loc.end.line}
                      <br />
                    </>
                  )}
                  {settings.showTooltipSourceSnippet && scopeNode.source && (
                    <>
                      <div
                        style={{
                          marginTop: "5px",
                          paddingTop: "5px",
                          borderTop: "1px solid #eee",
                        }}
                      >
                        Source snippet (first {snippetLength} chars):
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
                        {scopeNode.source.substring(0, snippetLength)}
                        {scopeNode.source.length > snippetLength ? "..." : ""}
                      </pre>
                    </>
                  )}
                </div>
              );
            }
          : (node) => null
      }
      isInteractive={true}
      animate={false}
      tile={settings.tile}
      leavesOnly={settings.leavesOnly}
      innerPadding={settings.innerPadding}
      outerPadding={settings.outerPadding}
      enableLabel={settings.enableLabel}
      labelSkipSize={settings.labelSkipSize}
      nodeOpacity={settings.nodeOpacity}
      borderWidth={settings.borderWidth}
    />
  );
};

export default TreemapDisplay;
