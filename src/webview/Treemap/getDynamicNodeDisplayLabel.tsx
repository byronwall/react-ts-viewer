import { type ScopeNode } from "../../types";
import { getNodeDisplayLabel } from "../getNodeDisplayLabel";
import { type TreemapSettings } from "../settingsConfig";

export const getDynamicNodeDisplayLabel = (
  parts: NodePartsForLabeling,
  settings: TreemapSettings
): string => {
  // Check height threshold
  if (parts.height < settings.minLabelHeight) {
    return "";
  }

  // Get the base label from existing logic
  let displayLabel = getNodeDisplayLabel(parts.data); // parts.data is ScopeNode

  // Apply truncation if enabled
  if (settings.truncateLabel) {
    let maxCharsAllowed = settings.labelMaxChars;

    // Calculate max characters based on node width, if avgCharPixelWidth is valid
    if (settings.avgCharPixelWidth > 0) {
      const maxCharsByWidth = Math.floor(
        parts.width / settings.avgCharPixelWidth
      );
      // Use the more restrictive limit between width-based and absolute max chars
      maxCharsAllowed = Math.min(maxCharsAllowed, maxCharsByWidth);
    }

    if (displayLabel.length > maxCharsAllowed) {
      if (maxCharsAllowed < 3) {
        // Not enough space for "..."
        return "";
      }
      displayLabel = displayLabel.substring(0, maxCharsAllowed - 3) + "...";
    }
  }

  return displayLabel;
}; // Define a type for the parts of a Nivo node needed for labeling

interface NodePartsForLabeling {
  data: ScopeNode;
  width: number;
  height: number;
}
