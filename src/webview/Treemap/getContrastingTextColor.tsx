// Helper function to determine contrasting text color (black or white)
export const getContrastingTextColor = (hexBackgroundColor: string): string => {
  if (!hexBackgroundColor) return "#000000"; // Default to black if no color provided

  // Remove # if present
  const hex = hexBackgroundColor.replace("#", "");

  // Convert hex to RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Calculate luminance (per WCAG 2.0)
  // Formula: 0.2126 * R + 0.7152 * G + 0.0722 * B
  // Note: RGB values should be in sRGB linear space (0-1 range)
  // For simplicity, we'll use the 0-255 range directly, which is common for this heuristic.
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

  // Use a threshold (0.5 is common) to decide text color
  return luminance > 0.5 ? "#000000" : "#ffffff"; // Dark text on light bg, White text on dark bg
};
