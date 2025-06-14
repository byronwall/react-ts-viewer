import React, { useState } from "react";
import { ArrowSquareOut, FunnelSimple, X } from "@phosphor-icons/react";
import { ScopeNode } from "../../types";
import { TreemapSettings } from "../settingsConfig";
import { CodeBlock } from "../CodeBlock";

interface NodeDetailDrawerProps {
  node: ScopeNode | null;
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  settings: TreemapSettings;
  onJumpToSource: (node: ScopeNode) => void;
  onDrillIntoNode: (node: ScopeNode) => void;
  width: number;
}

export const NodeDetailDrawer: React.FC<NodeDetailDrawerProps> = ({
  node,
  isOpen,
  onClose,
  fileName,
  settings,
  onJumpToSource,
  onDrillIntoNode,
  width,
}) => {
  const [wordWrapEnabled, setWordWrapEnabled] = useState<boolean>(true);

  if (!isOpen || !node) {
    return null;
  }

  const codeBlockLang =
    fileName.endsWith(".md") || fileName.endsWith(".mdx") ? "markdown" : "tsx";
  // Snippet length is no longer used for truncation here
  // const snippetLength = Math.max(0, settings.tooltipSourceSnippetLength);

  return (
    <div
      style={{
        height: "100%", // Ensure full height to eliminate transparent regions
        width: `${width}px`,
        backgroundColor: "#252526", // Opaque background
        color: "#cccccc",
        borderLeft: "1px solid #333333",
        padding: "10px",
        overflowY: "auto",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        position: "relative", // Ensure proper positioning
      }}
      className="node-detail-drawer"
    >
      <div
        style={{
          marginBottom: "8px",
          flexShrink: 0, // Prevent header from shrinking
        }}
      >
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          <button
            onClick={() => onJumpToSource(node)}
            className="treemap-export-button"
            title="Jump to Source (Cmd+Click)"
          >
            <ArrowSquareOut size={14} />
            Jump
          </button>
          <button
            onClick={() => onDrillIntoNode(node)}
            className="treemap-export-button"
            title="Drill In (Alt+Click)"
          >
            <FunnelSimple size={14} />
            Drill
          </button>
          <button
            onClick={onClose}
            className="treemap-settings-button"
            title="Close Details"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      <h4 style={{ margin: 0, fontSize: "0.9em", marginBottom: "8px" }}>
        Node Details: {node.id.split(":").pop()}
      </h4>

      {/* Content div to handle overflow for the rest of the items */}
      <div style={{ overflowY: "auto", flexGrow: 1 }}>
        {settings.showTooltipId && (
          <>
            <strong>ID: {node.id.split(":").pop()}</strong>
            {settings.showTooltipCategory && ` (${node.category})`}
            <br />
          </>
        )}
        {!settings.showTooltipId && settings.showTooltipCategory && (
          <>
            <strong>Category: {node.category}</strong>
            <br />
          </>
        )}
        {settings.showTooltipValue && (
          <>
            Value: {node.value} chars
            <br />
          </>
        )}
        {settings.showTooltipLines && node.loc && (
          <>
            Lines: {node.loc.start.line} - {node.loc.end.line}
            <br />
          </>
        )}
        {(node.meta?.collapsed || node.meta?.syntheticGroup) && (
          <div
            style={{
              marginTop: "5px",
              paddingTop: "5px",
              borderTop: "1px solid #444",
              color: "#aaa",
            }}
          >
            {node.meta?.collapsed && (
              <div style={{ fontStyle: "italic" }}>
                Collapsed {node.meta.originalCategory || node.category}
                {node.meta.collapsed === "arrowFunction" && node.meta.call && (
                  <> (calls: {node.meta.call})</>
                )}
              </div>
            )}
            {node.meta?.syntheticGroup && (
              <div style={{ fontWeight: "bold" }}>
                Group containing {node.meta.contains} nodes
              </div>
            )}
          </div>
        )}
        {settings.showTooltipSourceSnippet && node.source && (
          <>
            <div
              style={{
                marginTop: "5px",
                paddingTop: "5px",
                borderTop: "1px solid #444",
                display: "flex", // Added for inline layout
                justifyContent: "space-between", // Align items
                alignItems: "center", // Vertically align items
              }}
            >
              <span>Source snippet:</span>
              {/* Checkbox for word wrap */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  cursor: "pointer",
                  fontSize: "0.9em",
                }}
              >
                <input
                  type="checkbox"
                  checked={wordWrapEnabled}
                  onChange={() => setWordWrapEnabled(!wordWrapEnabled)}
                  style={{ marginRight: "4px" }}
                />
                Word Wrap
              </label>
            </div>
            <div
              style={{
                overflowY: "auto",
                background: "#1e1e1e",
                padding: "5px", // Reset padding as button is gone
                marginTop: "3px", // Added margin top back
              }}
            >
              <CodeBlock
                raw={node.source.trim()}
                lang={codeBlockLang}
                wordWrapEnabled={wordWrapEnabled}
              />
            </div>
          </>
        )}
        {!node.source && settings.showTooltipSourceSnippet && (
          <p style={{ marginTop: "5px", color: "#aaa" }}>
            No source snippet available for this node.
          </p>
        )}
      </div>
    </div>
  );
};
