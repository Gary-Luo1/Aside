## Why

The extension currently moves focus to its explanation trigger as soon as text is selected, which makes ordinary copying feel interrupted even though no AI request has started. Some supported-looking pages also fail because selection recovery is difficult to save and the content script only runs in the top-level HTTP/HTTPS document.

## What Changes

- Replace the focus-stealing selection trigger with a passive, compact explanation entry point that preserves the page focus, selection, and native copy behavior.
- Continue requiring an explicit user action before sending selected text for explanation.
- Allow the existing “restore selection” preference to be changed and saved without retesting unchanged AI connection settings, and clearly communicate when a page refresh is required.
- Extend selection support to ordinary DOM text inside HTTP/HTTPS frames while isolating frame sessions and requests.
- Define and document the supported-page boundary so browser-internal pages, special document renderers, canvas/image text, and complex editor selection models are not silently presented as supported.
- Add browser-level regression coverage for copying, passive trigger behavior, preference persistence, protected text, and framed pages.
- This change does not add OCR, PDF-specific support, browser-internal page injection, complex rich-text editor adapters, or automatic inference of whether a user intends to copy or explain.

## Capabilities

### New Capabilities

- `passive-selection-trigger`: Covers non-disruptive trigger presentation, preservation of native selection/copy behavior, explicit explanation activation, and keyboard accessibility.
- `selection-recovery-settings`: Covers persistence and activation of the optional protected-page selection recovery preference without unnecessary AI connection retesting.
- `framed-page-selection`: Covers supported HTTP/HTTPS frame injection, frame-scoped explanation sessions, and explicit unsupported-page boundaries.

### Modified Capabilities

None. The project has no existing OpenSpec capability specifications.

## Impact

- Content selection controller, session state machine, overlay focus and placement behavior, and related unit/E2E tests.
- Options-page save gating, configuration persistence, user-facing status text, and protected-selection tests.
- Extension manifest injection rules, message sender validation, explanation request coordination, frame lifecycle behavior, and iframe E2E fixtures.
- Installation and usage documentation describing refresh requirements and unsupported page types.
- No new runtime dependency, external service, permission category, or AI request payload is intended.
