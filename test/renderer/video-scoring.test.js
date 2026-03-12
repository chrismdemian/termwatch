import { describe, it, expect } from 'vitest';
import { scoreVideo, findBestVideo } from '../../src/preload/video-scoring.js';

function makeVideo({ paused = true, duration = 0, width = 640, height = 360, hasSrc = false, hasSource = false } = {}) {
  return {
    paused,
    duration,
    src: hasSrc ? 'https://example.com/video.mp4' : '',
    getBoundingClientRect: () => ({ width, height }),
    querySelector: (sel) => (hasSource && sel === 'source' ? {} : null),
  };
}

describe('scoreVideo()', () => {
  it('playing video gets +100', () => {
    // Use width/height that divide evenly to avoid floating point in area calc
    const playing = scoreVideo(makeVideo({ paused: false, width: 1000, height: 1000 }));
    const paused = scoreVideo(makeVideo({ paused: true, width: 1000, height: 1000 }));
    expect(playing - paused).toBe(100);
  });

  it('duration adds up to cap of 7200', () => {
    const short = scoreVideo(makeVideo({ duration: 60 }));
    const long = scoreVideo(makeVideo({ duration: 3600 }));
    expect(long).toBeGreaterThan(short);

    const capped = scoreVideo(makeVideo({ duration: 10000 }));
    const atCap = scoreVideo(makeVideo({ duration: 7200 }));
    expect(capped).toBe(atCap);
  });

  it('larger visible area scores higher', () => {
    const small = scoreVideo(makeVideo({ width: 320, height: 240 }));
    const large = scoreVideo(makeVideo({ width: 1920, height: 1080 }));
    expect(large).toBeGreaterThan(small);
  });

  it('video with src scores +10', () => {
    const withSrc = scoreVideo(makeVideo({ hasSrc: true }));
    const withoutSrc = scoreVideo(makeVideo({ hasSrc: false }));
    expect(withSrc - withoutSrc).toBe(10);
  });

  it('video with <source> child scores +10', () => {
    const withSource = scoreVideo(makeVideo({ hasSource: true }));
    const withoutSource = scoreVideo(makeVideo({ hasSource: false }));
    expect(withSource - withoutSource).toBe(10);
  });

  it('non-finite duration contributes 0', () => {
    const finite = scoreVideo(makeVideo({ duration: 0 }));
    const inf = scoreVideo(makeVideo({ duration: Infinity }));
    const nan = scoreVideo(makeVideo({ duration: NaN }));
    expect(inf).toBe(finite);
    expect(nan).toBe(finite);
  });
});

describe('findBestVideo()', () => {
  it('returns null for empty array', () => {
    expect(findBestVideo([])).toBeNull();
  });

  it('returns null for null/undefined', () => {
    expect(findBestVideo(null)).toBeNull();
    expect(findBestVideo(undefined)).toBeNull();
  });

  it('returns single video when only one exists', () => {
    const v = makeVideo();
    expect(findBestVideo([v])).toBe(v);
  });

  it('playing video scores higher than paused', () => {
    const paused = makeVideo({ paused: true, duration: 100 });
    const playing = makeVideo({ paused: false, duration: 100 });
    expect(findBestVideo([paused, playing])).toBe(playing);
  });

  it('combined: playing + long + large beats paused + short + small', () => {
    const ad = makeVideo({ paused: false, duration: 30, width: 300, height: 250, hasSrc: true });
    const content = makeVideo({ paused: false, duration: 3600, width: 1920, height: 1080, hasSrc: true });
    expect(findBestVideo([ad, content])).toBe(content);
  });
});
