import { Popover } from "@headlessui/react";
import { Palette } from "@phosphor-icons/react";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { TreemapLegendContent } from "./TreemapLegendContent";

import { type NodeCategory } from "../../types";

interface TreemapLegendPopoverProps {
  activePalette: Record<NodeCategory, string>;
}

export const TreemapLegendPopover: React.FC<TreemapLegendPopoverProps> = ({
  activePalette,
}) => (
  <Popover>
    {({ open }) => {
      const [buttonRef, setButtonRef] = useState<HTMLButtonElement | null>(
        null
      );
      const [panelPosition, setPanelPosition] = useState({
        top: 0,
        right: 0,
      });

      useEffect(() => {
        if (open && buttonRef) {
          const rect = buttonRef.getBoundingClientRect();
          setPanelPosition({
            top: rect.bottom + 4, // Position below button with small gap
            right: window.innerWidth - rect.right, // Right align with button
          });
        }
      }, [open, buttonRef]);

      return (
        <>
          <Popover.Button
            ref={setButtonRef}
            className="treemap-header-button"
            title="Toggle Legend"
          >
            <Palette size={14} />
            Legend
          </Popover.Button>

          {open &&
            createPortal(
              <Popover.Panel
                static
                className="treemap-popover-base treemap-legend-popover"
                style={{
                  position: "fixed",
                  top: panelPosition.top,
                  right: panelPosition.right,
                  zIndex: 9999,
                }}
              >
                <h4>Legend</h4>
                <TreemapLegendContent activePalette={activePalette} />
              </Popover.Panel>,
              document.body
            )}
        </>
      );
    }}
  </Popover>
);
