## Purpose

Extend term selection and explanation to ordinary DOM text in HTTP/HTTPS frames while keeping each frame’s interaction and request lifecycle isolated and clearly defining unsupported page types.

## ADDED Requirements

### Requirement: HTTP and HTTPS frames are supported
The extension SHALL initialize its selection experience in top-level documents and child frames whose own document URL uses HTTP or HTTPS, including same-origin and cross-origin frames covered by the extension’s existing host access.

#### Scenario: Same-origin frame selection
- **WHEN** a user selects a valid term in an HTTP/HTTPS same-origin child frame
- **THEN** the passive explanation trigger appears within that frame and can start an explanation

#### Scenario: Cross-origin frame selection
- **WHEN** a user selects a valid term in an HTTP/HTTPS cross-origin child frame for which extension site access is granted
- **THEN** the passive explanation trigger appears within that frame and can start an explanation

#### Scenario: Frame access is not granted
- **WHEN** Chrome site-access settings do not permit the extension to run in a frame’s origin
- **THEN** the extension does not claim that selection is available in that frame and does not attempt to bypass Chrome permissions

### Requirement: Explanation lifecycle is frame-scoped
Each supported frame SHALL maintain its own selection UI and in-flight explanation lifecycle. A newer explanation request in one frame MUST invalidate an older request from that same frame, but MUST NOT cancel or overwrite a request or result belonging to another frame.

#### Scenario: New request in the same frame
- **WHEN** a user starts a second explanation in the same frame while an earlier request from that frame is in flight
- **THEN** the older request is invalidated and cannot overwrite the second result

#### Scenario: Requests in different frames
- **WHEN** explanation requests are in flight in two different frames of the same tab
- **THEN** each frame retains its own request and result without cancellation or UI overwrite from the other frame

### Requirement: Frame payload follows the same privacy boundary
An explanation request from a frame SHALL contain only the validated selected term and SHALL NOT add frame URL, parent-page URL, title, surrounding paragraph, or selection history to the AI request.

#### Scenario: Explain term inside a frame
- **WHEN** a user activates explanation for a term selected inside a supported frame
- **THEN** the AI request contains the validated term but none of the frame or parent-page context

### Requirement: Unsupported document types are documented
User documentation SHALL state that browser-internal pages, extension pages, special PDF/document viewers, canvas or image text, special-scheme frames, and complex editor-specific selection models are outside this change’s supported-page boundary.

#### Scenario: User checks compatibility guidance
- **WHEN** a user consults the installation or usage guide after a page does not support selection
- **THEN** the guide distinguishes supported HTTP/HTTPS DOM text, optional CSS selection recovery, permission limitations, refresh requirements, and explicitly unsupported document types

