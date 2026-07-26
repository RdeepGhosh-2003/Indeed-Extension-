# Project: Indeed Extension - Search Fill Button & Auto-Fill

## Architecture
Browser extension targeting Indeed (`indeed.com`).
- **Content Script (`scripts/content.js`, `scripts/content.css`, `scripts/matcher.js`)**:
  - Injected into Indeed pages (`indeed.com/*`).
  - Auto-fill functionality for job application forms (modals, dialogs).
  - Search Fill UI Injection: Injects a "Search Fill" button featuring the Indeed logo adjacent to the Indeed global search bar (`#jobsearch` or `form[role="search"]`).
  - Search Fill Action: Reads `work.targetRole.jobTitle` and `work.targetRole.targetLocation` from Chrome local storage (`chrome.storage.local`), fills `#text-input-what` and `#text-input-where` search inputs, and dispatches native React input/change events.
- **Background / Popup Script (`scripts/background.js`, `popup/`)**:
  - Manages extension state, user profile storage (including `work.targetRole.jobTitle` and `work.targetRole.targetLocation`), and popup UI.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Exploration & Architecture (Phase 2: Search Fill) | Codebase investigation, search bar DOM structure analysis, Chrome storage data schema, UI injection positioning | none | DONE |
| 2 | Search Fill Implementation | Inject "Search Fill" button with Indeed logo adjacent to `#jobsearch`, read profile data, fill search inputs, dispatch React events | M1 | DONE |
| 3 | Multi-Agent Verification & Forensic Audit | Code review, edge-case stress testing, DOM isolation check, Forensic Auditor verification | M2 | DONE |
| 4 | Integration & Victory Claim | Verify all acceptance criteria and produce final report | M3 | DONE |

## Interface Contracts
- **Storage Contract**: Profile object stored in `chrome.storage.local` under `'userProfile'` key containing `work.targetRole.jobTitle` (string) and `work.targetRole.targetLocation` (string) (with fallbacks to `recentJobTitle` and `city`).
- **Search Fill UI Contract**: Button displaying text "Search Fill" and the Indeed logo SVG injected adjacent to search bar (`#jobsearch` / `form[role="search"]`). If search bar is null/absent, button is not injected or hidden. ID of button element: `indeed-search-fill-btn`.
- **Autofill Event Contract**: Setting value on `#text-input-what` (`q`) and `#text-input-where` (`l`) must invoke native property setters (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set`) and dispatch `'input'`, `'change'`, and `'blur'` events so React state synchronizes.

## Code Layout
- `manifest.json`: Extension manifest declaring content scripts, permissions (`storage`), web accessible resources.
- `scripts/content.js`: Main content script for DOM observation, search button injection, profile autofill.
- `scripts/content.css`: Styles for injected elements including `.indeed-search-fill-btn`, logo icon, hover states.
- `scripts/matcher.js`: DOM query helper predicates and input matching logic.
- `scripts/background.js`: Service worker / background script.
- `popup/`: Popup interface for updating user target role/location in local storage.
- `data/default_profile.json`: Default user profile schema.
- `tests/`: Automated DOM unit/integration tests and stress test harnesses.
