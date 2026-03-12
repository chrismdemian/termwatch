/**
 * Video scoring logic extracted from video-preload.js for testability.
 *
 * scoreVideo(v) — score a single <video> element
 * findBestVideo(videos) — pick the best video from an array/NodeList
 */

/**
 * Score a single video element.
 * playing (+100), duration clamped to 7200, visible area / 1000, has source (+10).
 */
function scoreVideo(v) {
  let score = 0;
  if (!v.paused) score += 100;
  if (isFinite(v.duration) && v.duration > 0) score += Math.min(v.duration, 7200);
  const rect = v.getBoundingClientRect();
  score += (rect.width * rect.height) / 1000;
  if (v.src || v.querySelector('source')) score += 10;
  return score;
}

/**
 * Find the best video element from an array-like collection.
 * Returns null for empty input, the single element for length 1,
 * or the highest-scoring element for multiple.
 */
function findBestVideo(videos) {
  if (!videos || videos.length === 0) return null;
  if (videos.length === 1) return videos[0];

  let best = null;
  let bestScore = -1;
  for (const v of videos) {
    const score = scoreVideo(v);
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return best;
}

module.exports = { scoreVideo, findBestVideo };
