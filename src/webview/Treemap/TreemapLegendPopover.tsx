import React from "react";
import { TreemapLegendContent } from "./TreemapLegendContent";
import { NodeCategory } from "../../types";

export interface TreemapLegendPopoverProps {
  activePalette: Record<NodeCategory, string>;
  isOpen: boolean;
  onClose: () => void; // Or a toggle function
  anchorElement: HTMLElement | null; // To position relative to the button
}

export const TreemapLegendPopover: React.FC<TreemapLegendPopoverProps> = ({
  activePalette,
  isOpen,
  onClose, // We might not use onClose directly if the button toggles
  anchorElement,
}) => {
  if (!isOpen) return null;

  // Basic positioning logic - can be refined
  const popoverStyle: React.CSSProperties = {
    position: "absolute",
    top: anchorElement
      ? anchorElement.offsetTop + anchorElement.offsetHeight + 5
      : "60px", // Below the anchor + 5px margin
    right: "10px", // Align to the right of the header area
    backgroundColor: "#2c2c2c",
    color: "#cccccc",
    border: "1px solid #444444",
    borderRadius: "4px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    padding: "10px 15px",
    zIndex: 1000,
    minWidth: "200px",
    maxHeight: "250px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  };

  return (
    <div style={popoverStyle} className="treemap-legend-popover">
      <TreemapLegendContent activePalette={activePalette} />
    </div>
  );
};
