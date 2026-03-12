# Manual Accessibility Checklist

These checks require human verification and cannot be fully automated.

## Screen Reader (NVDA / Narrator)

- [ ] Control buttons announce their `title` text (Back, Forward, Settings, etc.)
- [ ] URL input is announced with its placeholder text
- [ ] Settings modal opening is announced
- [ ] Settings modal sections (Terminal, Behavior, Data) are distinguishable
- [ ] Modal close button is announced

## Keyboard Navigation

- [ ] All controls in the controls bar are reachable via Tab
- [ ] Enter/Space activates focused buttons
- [ ] Escape closes the settings modal
- [ ] Layout select dropdown is operable with arrow keys
- [ ] URL input accepts text and submits on Enter
- [ ] Bookmarks bar items are reachable via Tab when visible

## Focus Management

- [ ] Settings modal traps focus while open
- [ ] Focus returns to the settings button after modal closes
- [ ] Focus indicators are visible on all interactive elements

## Visual

- [ ] All text is readable at 200% browser zoom
- [ ] Controls bar remains usable at 200% zoom
- [ ] Color contrast is sufficient for button icons against the background
- [ ] Focus ring is visible against both light and dark video backgrounds
