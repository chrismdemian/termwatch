// Keyboard shortcut definitions — data only, no DOM or side effects.
// Used by help-modal.js and tests.

const SHORTCUT_DATA = [
  {
    category: 'General',
    shortcuts: [
      { keys: ['?'], action: 'Show keyboard shortcuts' },
      { keys: ['Ctrl', 'Shift', ','], action: 'Open settings' },
      { keys: ['Escape'], action: 'Close modal / exit mode' },
      { keys: ['F11'], action: 'Toggle fullscreen' },
    ],
  },
  {
    category: 'Video',
    shortcuts: [
      { keys: ['Ctrl', 'Shift', 'V'], action: 'Toggle video mode' },
      { keys: ['Ctrl', 'Shift', 'T'], action: 'Toggle theater mode' },
      { keys: ['Ctrl', 'Shift', 'Space'], action: 'Play / pause video' },
    ],
  },
  {
    category: 'Terminals',
    shortcuts: [
      { keys: ['Ctrl', 'Shift', '1–4'], action: 'Focus terminal 1–4' },
      { keys: ['Ctrl', 'Shift', 'L'], action: 'Cycle layout' },
      { keys: ['Ctrl', 'Shift', 'R'], action: 'Restart all terminals' },
      { keys: ['Ctrl', 'Shift', '\u2191'], action: 'Increase opacity' },
      { keys: ['Ctrl', 'Shift', '\u2193'], action: 'Decrease opacity' },
    ],
  },
  {
    category: 'Navigation',
    shortcuts: [
      { keys: ['Ctrl', 'Shift', 'B'], action: 'Toggle bookmarks bar' },
      { keys: ['Alt', '\u2190'], action: 'Go back (video mode)' },
      { keys: ['Alt', '\u2192'], action: 'Go forward (video mode)' },
    ],
  },
];

module.exports = SHORTCUT_DATA;
