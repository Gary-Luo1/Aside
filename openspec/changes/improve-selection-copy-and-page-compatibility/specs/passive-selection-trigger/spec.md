## Purpose

Preserve the browser’s native selection and copying experience while offering a discoverable, compact, user-activated entry point for requesting an explanation.

## ADDED Requirements

### Requirement: Selection trigger is passive
When a valid term is selected, the extension SHALL present a compact explanation trigger without automatically moving keyboard focus away from the page or selected content. The trigger SHALL remain keyboard-focusable through normal keyboard navigation and SHALL occupy no more than 36 CSS pixels in height.

#### Scenario: Mouse selection presents a passive trigger
- **WHEN** a user selects a valid term with the pointer on a supported page
- **THEN** a compact explanation trigger appears near the selection and the extension does not move focus to it

#### Scenario: Keyboard selection presents a passive trigger
- **WHEN** a user creates a valid text selection using the keyboard on a supported page
- **THEN** the same passive trigger appears without replacing the page’s current focus

#### Scenario: Trigger remains keyboard operable
- **WHEN** a user navigates keyboard focus to the passive trigger and activates it
- **THEN** the extension starts the same explanation flow as pointer activation

### Requirement: Native copying remains unchanged
The extension SHALL preserve the browser selection and SHALL NOT cancel, rewrite, or stop propagation of native copy or context-menu events merely because the passive trigger is visible.

#### Scenario: Copy after selection
- **WHEN** a user selects a valid term, sees the passive trigger, and invokes the browser copy command
- **THEN** the selected term remains the copy source and the page receives its normal copy event

#### Scenario: Page copy handler remains active
- **WHEN** a supported page has its own copy-event handler and the user copies selected text while the trigger is visible
- **THEN** the page handler runs without interference from the extension

### Requirement: Explanation requires explicit activation
The extension SHALL NOT send selected text to the configured AI endpoint until the user explicitly activates the explanation trigger.

#### Scenario: Selection alone sends no request
- **WHEN** a user selects a valid term and does not activate the trigger
- **THEN** no explanation request is sent

#### Scenario: Trigger activation sends only the selected term
- **WHEN** a user explicitly activates the explanation trigger
- **THEN** the extension sends an explanation request containing only the validated selected term and transitions to the explanation card

### Requirement: Trigger placement avoids selection obstruction
The extension SHALL place the passive trigger within the visible viewport and outside the selected text’s bounding rectangle whenever the viewport provides space above or below the selection.

#### Scenario: Space exists below the selection
- **WHEN** a valid selection has sufficient visible space below it
- **THEN** the trigger is positioned below the selection without overlapping the selected text

#### Scenario: Space only exists above the selection
- **WHEN** there is insufficient visible space below a valid selection but sufficient space above it
- **THEN** the trigger is positioned above the selection and remains within the viewport

