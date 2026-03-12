/**
 * Pure utility functions extracted from Settings for testability.
 */

/**
 * Convert a hex color string to rgba().
 * @param {string} hex - e.g. '#e8e6e3'
 * @param {number} alpha - 0..1
 * @returns {string} e.g. 'rgba(232, 230, 227, 0.3)'
 */
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Normalize a hex color value: ensure '#' prefix and lowercase.
 * Returns null for invalid input.
 * @param {string} value - e.g. 'AABBCC' or '#aabbcc'
 * @returns {string|null} e.g. '#aabbcc' or null
 */
function normalizeHex(value) {
  const match = value.match(/^#?([0-9a-fA-F]{6})$/);
  if (match) return '#' + match[1].toLowerCase();
  return null;
}

module.exports = { hexToRgba, normalizeHex };
