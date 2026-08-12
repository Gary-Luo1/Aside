## Purpose

Let users reliably enable optional selection recovery on CSS-protected pages without coupling a display preference change to unnecessary AI connection retesting.

## ADDED Requirements

### Requirement: Saved connection remains eligible when only selection recovery changes
After a previously tested and valid AI configuration is loaded, the system SHALL allow the user to change and save only the selection-recovery preference without performing another connection test.

#### Scenario: Enable recovery after reopening settings
- **WHEN** a user reopens settings with a valid saved AI configuration and enables selection recovery without changing Base URL, API Key, or Model
- **THEN** saving is available without another connection test and the enabled preference persists

#### Scenario: Disable recovery after reopening settings
- **WHEN** a user reopens settings with a valid saved AI configuration and disables selection recovery without changing Base URL, API Key, or Model
- **THEN** saving is available without another connection test and the disabled preference persists

### Requirement: Connection changes still require retesting
The system MUST require a successful connection test before saving whenever Base URL, API Key, or Model differs from the last successfully tested or previously saved valid connection configuration.

#### Scenario: Connection field changes
- **WHEN** a user changes Base URL, API Key, or Model after settings have loaded
- **THEN** saving is disabled until the changed connection configuration passes a connection test

#### Scenario: Recovery preference does not invalidate connection trust
- **WHEN** a user changes only the selection-recovery preference
- **THEN** the previously valid connection remains eligible for saving

### Requirement: Activation timing is explicit
After the selection-recovery preference is saved, the settings page SHALL tell the user that already-open pages must be refreshed before the new preference takes effect.

#### Scenario: Save recovery preference
- **WHEN** a user successfully saves a changed selection-recovery preference
- **THEN** the settings page confirms the save and instructs the user to refresh already-open target pages

#### Scenario: Newly loaded page uses saved preference
- **WHEN** a supported page loads after selection recovery has been enabled and saved
- **THEN** the page initializes with selection recovery enabled

### Requirement: Recovery is limited to CSS-protected DOM text
When enabled, selection recovery SHALL restore native selection for ordinary DOM text blocked by CSS selection rules, SHALL avoid interactive controls, and SHALL NOT copy or send unselected page content.

#### Scenario: CSS-protected text becomes selectable
- **WHEN** selection recovery is enabled and the user drags across ordinary DOM text blocked by a CSS selection rule
- **THEN** native text selection becomes available for that protected region

#### Scenario: Interactive control is not overridden
- **WHEN** the user interacts with a button, link, form control, or editable control inside a protected region
- **THEN** selection recovery does not override that control’s interaction behavior

