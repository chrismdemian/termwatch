/**
 * Pure utility functions extracted from Controls for testability.
 */

/**
 * Format seconds into "m:ss" display string.
 * Returns '0:00' for non-finite or negative values.
 */
function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Normalize a URL by prepending https:// if no protocol is present.
 */
function normalizeUrl(input) {
  if (!input) return input;
  const trimmed = input.trim();
  if (trimmed && !trimmed.match(/^https?:\/\//)) {
    return 'https://' + trimmed;
  }
  return trimmed;
}

module.exports = { formatTime, normalizeUrl };
