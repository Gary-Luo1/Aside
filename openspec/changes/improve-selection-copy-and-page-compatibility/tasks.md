## 1. Establish Baseline and Passive Trigger

- [x] 1.1 Run the current targeted unit and browser selection tests, record baseline results, and confirm the protected existing worktree files remain untouched. Baseline: 35 unit tests and 17 selection E2E tests passed; existing Vite config warning remains.
- [x] 1.2 Add a browser regression test proving that selection shows the trigger without moving page focus and that selection alone sends no AI request.
- [x] 1.3 Add a non-destructive browser regression test proving the native copy event and selected text remain available while the trigger is visible, including a page-owned copy handler.
- [x] 1.4 Remove automatic ready-trigger focus, reduce the trigger to a compact height of at most 36 CSS pixels, and preserve semantic button and keyboard activation behavior.
- [x] 1.5 Extend placement assertions so the compact trigger stays in the viewport and does not overlap the selected rectangle when space exists above or below.
- [x] 1.6 Run the passive-trigger unit and E2E tests and manually verify mouse selection, keyboard selection, copy, right-click, explicit activation, Escape, and scrolling on a normal page. Headful browser checks cover all listed interactions; right-click and scroll regression tests pass.

## 2. Repair Selection-Recovery Settings

- [x] 2.1 Add a failing settings E2E case that reopens a valid saved configuration, changes only selection recovery, saves without a new connection test, and verifies persistence. Red on old build, green after fix.
- [x] 2.2 Initialize save gating from a loaded valid saved connection while continuing to invalidate it when Base URL, API Key, or Model changes.
- [x] 2.3 Update successful save feedback to state that already-open target pages must be refreshed for selection-recovery changes to take effect.
- [x] 2.4 Verify enable, disable, persistence, connection-field retest gating, page-refresh activation, CSS-protected text, and interactive-control preservation. Options E2E passes 7/7; protected-page flow and interactive control pass in full E2E.

## 3. Add HTTP/HTTPS Frame Support

- [x] 3.1 Add same-origin, cross-origin, nested, and unsupported special-scheme frame fixtures without introducing external services.
- [x] 3.2 Add browser tests proving the passive trigger and explanation flow work in granted same-origin and cross-origin HTTP/HTTPS frames.
- [x] 3.3 Enable static content-script injection in all matching HTTP/HTTPS frames while leaving special-origin fallback injection disabled.
- [x] 3.4 Change in-flight request coordination to use a tab-and-frame identity and add unit coverage for same-frame cancellation, different-frame isolation, and missing identifiers.
- [x] 3.5 Pass validated sender frame identity through the background explanation path without weakening HTTP/HTTPS sender checks or credential isolation.
- [x] 3.6 Add E2E coverage proving different frames do not cancel or overwrite one another, while a newer request in the same frame invalidates the older result.
- [x] 3.7 Verify frame-origin explanation requests contain only the validated selected term and exclude frame URL, parent URL, title, surrounding text, and history.
- [x] 3.8 Run nested-frame smoke checks for duplicate controller or overlay initialization and confirm frame-local UI remains within the frame viewport.

## 4. Documentation and Full Verification

- [x] 4.1 Update installation and usage guidance with the passive-trigger behavior, refresh requirement, Chrome site-access dependency, supported HTTP/HTTPS DOM/frame scope, and explicit unsupported document types.
- [x] 4.2 Run type checking, all unit/integration tests, all Playwright E2E tests, and the extension production build using the project’s full extension check. `npm run extension:check` passed: typecheck, 109 unit/integration tests, 45 E2E tests, and production build.
- [x] 4.3 Load the fresh unpacked build in a headful Chromium persistent context and verify a normal page, CSS-protected page, same-origin frame, and cross-origin frame. All corresponding smoke paths passed; a separate end-user Chrome session was not required for this automated browser evidence.
- [x] 4.4 Inspect the final diff for unrelated changes, generated residue, permission expansion, sensitive data, and accidental weakening of tests or privacy boundaries. `git diff --check` passed; screenshot outputs created by E2E were restored, and only the expected `all_frames` permission was added.
- [x] 4.5 Reconcile every acceptance scenario in the three capability specs with automated or explicit manual evidence and hand off the implementation as pending independent review. Specs, tests, docs, and implementation are reconciled; release/archival remains gated on independent review.
