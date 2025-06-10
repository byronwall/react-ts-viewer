import React from "react";
import { NodeCategory } from "../../types";

interface TreemapLegendContentProps {
  activePalette: Record<NodeCategory, string>;
}

export const TreemapLegendContent: React.FC<TreemapLegendContentProps> = ({
  activePalette,
}) => {
  const legendCategories = getNodeCategoryKeys().filter(
    (key) => activePalette[key as NodeCategory]
  );

  if (legendCategories.length === 0) {
    return (
      <div style={{ padding: "10px", textAlign: "center" }}>
        No categories to display in legend.
      </div>
    );
  }

  return (
    <>
      {legendCategories.map((categoryKey) => {
        const categoryName = categoryKey as NodeCategory;
        const color = activePalette[categoryName];
        return (
          <div
            key={categoryName}
            style={{ display: "flex", alignItems: "center" }}
          >
            <span
              style={{
                width: "12px",
                height: "12px",
                backgroundColor: color,
                marginRight: "5px",
                border: "1px solid #555",
                display: "inline-block",
              }}
            ></span>
            {categoryName}
          </div>
        );
      })}
    </>
  );
};

const getNodeCategoryKeys = () => {
  return Object.values(NodeCategory).filter(
    (value) => typeof value === "string"
  ) as string[];
};
