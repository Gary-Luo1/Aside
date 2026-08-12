## Context

See `proposal.md` for motivation. The content script currently creates one selection controller per injected document, renders its UI in a document-local Shadow DOM host, and sends explanation messages to a background service worker. The ready-state trigger takes focus immediately. Static injection matches HTTP/HTTPS but omits frame injection, while background request coordination identifies active work only by tab. The selection-recovery flag is stored with the AI configuration, read once when a page initializes, and cannot currently be saved by itself after settings are reopened.

The design must preserve the existing privacy boundary: content scripts cannot read stored credentials, background code validates senders and payloads, and only the validated selected term reaches the AI endpoint.

## Goals / Non-Goals

**Goals:**

- Make the selection trigger passive and compact without weakening explicit user activation or keyboard operability.
- Preserve browser and page-native selection, copying, and context-menu behavior.
- Repair save gating for the existing selection-recovery flag without a storage migration.
- Support ordinary HTTP/HTTPS child frames with frame-scoped request cancellation and result ownership.
- Add behavior-level browser tests that fail if focus stealing, copy interference, preference persistence, or frame isolation regresses.

**Non-Goals:**

- Real-time propagation of preference changes to already-loaded content scripts.
- OCR, PDF viewer integration, canvas selection, input/textarea selection, or editor-specific adapters.
- Injection into browser-internal, extension, `about:`, `data:`, `blob:`, or `filesystem:` documents.
- A per-site enable/disable control or a new global keyboard shortcut.

## Decisions

### 1. Keep the trigger visible but remove automatic focus

The ready-state control will remain a real button in the Shadow DOM, use a shorter compact presentation, and stay in normal keyboard navigation, but rendering it will not call focus. The selected term remains stored in the session, so later pointer or keyboard activation can start explanation even if the browser changes the visual selection while focus moves voluntarily.

No copy-event handler will be added. Native copy is preserved by absence of interception, and the trigger follows the existing close rules when the selection collapses, the user dismisses it, or its anchor leaves the viewport.

**Alternatives considered:** Shortcut-only activation removes almost all visual interference but reduces discoverability and introduces shortcut conflicts. Delayed display and copy-intent inference add timing-dependent behavior without removing focus risk. Both are rejected for this change.

### 2. Reuse the loaded valid connection as the tested baseline

When settings load a valid saved configuration, the connection fields from that configuration will initialize the comparison baseline used by save gating. Changing only `restoreSelection` therefore leaves saving enabled; changing Base URL, API Key, or Model invalidates the baseline until a connection test succeeds.

The setting remains stored with the existing configuration for backward compatibility. Successful saves that change selection recovery will display a refresh instruction. Content scripts continue reading the UI-only value through the background boundary once at initialization.

**Alternatives considered:** Moving the flag into a separate UI-settings storage record would create a migration and additional read/write paths for one preference. Dynamic background broadcasting would require attach/detach lifecycle work. Both can be reconsidered if more UI preferences are added.

### 3. Inject only into frames with their own HTTP/HTTPS URL

Static content-script registration will opt into all matching frames. Special-origin fallback injection will remain disabled, so `about:blank`, `data:`, `blob:`, and similar frames stay out of scope. Existing HTTP/HTTPS sender validation remains the authorization floor, including for frames.

Each injected frame owns its controller and overlay. UI placement is calculated against that frame’s viewport and may not escape the frame boundary. Same-origin and cross-origin HTTP/HTTPS fixtures will verify the supported path under granted host access.

**Alternatives considered:** Relaying every frame selection to a single top-frame overlay avoids iframe clipping but requires cross-frame geometry translation, lifecycle coordination, and a broader message protocol. Frame-local UI matches the current document-local architecture and is lower risk.

### 4. Key active requests by tab and frame

Background request coordination will use a composite document location derived from sender tab and frame identifiers. A new request aborts only the prior request with the same composite key. Missing identifiers remain isolated rather than sharing a global key.

The content-session sequence guard remains responsible for ignoring stale results within one frame. This preserves duplicate-request protection while preventing two frames in the same tab from cancelling or overwriting each other.

**Alternatives considered:** Keeping tab-only coordination is simpler but makes valid frame requests interfere and can surface cancellation errors in the wrong frame. A fully global one-request policy would also contradict frame-local UI ownership.

### 5. Verify user behavior at the browser boundary

Unit tests will cover session and coordinator keys, but acceptance depends on real-browser tests. Copy tests will observe focus, selection, and a non-destructive intercepted copy event without reading or overwriting the operating-system clipboard. Frame fixtures will cover same-origin, cross-origin, same-frame cancellation, different-frame isolation, and selected-term-only payloads.

## Risks / Trade-offs

- [A passive button may be less obvious to keyboard-only users] → Keep semantic button behavior and normal keyboard focusability; verify keyboard activation without automatic focus.
- [The trigger can still visually compete with nearby controls] → Reduce its footprint and retain viewport-aware above/below placement with non-overlap assertions.
- [Frame-local UI can be clipped by iframe boundaries] → Keep controls within the frame viewport and document this architectural limit rather than adding fragile cross-frame geometry.
- [All-frame injection increases the number of listeners and Shadow DOM hosts] → Initialize once per document, keep observers document-local, and include a nested-frame smoke test for duplicate initialization.
- [Cross-origin frame behavior depends on Chrome site access] → Test with granted access and document that the extension never bypasses browser permissions.
- [Treating a loaded valid configuration as previously tested does not prove the endpoint is still online] → This matches existing persisted-configuration semantics; only connection-field changes require a new test.

## Migration Plan

1. Implement and verify the passive trigger and copy regression independently of frame changes.
2. Repair settings save gating while retaining the existing storage shape, then verify old saved configurations load unchanged.
3. Add all-frame injection and composite request keys, followed by same-origin and cross-origin frame tests.
4. Rebuild the unpacked extension and run the full extension check plus manual Chrome verification on a normal page, a CSS-protected page, and framed fixtures.
5. Update installation and compatibility guidance before packaging.

Rollback is code-only: restore top-frame-only injection and tab-only coordination, restore the prior trigger presentation, and retain the unchanged stored configuration. No data migration or destructive rollback is required.
