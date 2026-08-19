# UI/UX Automated Testing Workflow & Standard Navigation Steps

## Overview

This guide defines the standardized UI/UX automated testing process for the AI Novel Writing Assistant frontend application. It specifies key UI flow navigation paths, core component selector assertions, and verification criteria for browser-based automation subagents and testing scripts.

## Target Scenarios & Routes

| Feature Area | Target Route / Entrypoint | Key Selectors / Elements | Verification Objective |
| :--- | :--- | :--- | :--- |
| **Home & Book Shelf** | `/` or `/novels` | `[data-testid="novel-shelf"]`, `[data-testid="quick-setup-btn"]` | Validate primary navigation, shelf rendering, and entry buttons. |
| **Simple Creation Mode** | `/novels/simple` | `[data-testid="simple-creation-panel"]`, `[data-testid="materials-container"]` | Ensure beginner-friendly simple creation UI components load cleanly. |
| **Onboarding Journey** | `/` (when user is new) | `[data-testid="onboarding-journey-strip"]`, `[data-testid="quick-setup-dialog"]` | Verify onboarding guidance strip and quick setup dialog triggers. |
| **Auto-Director Progress** | `/novels/director/*` | `[data-testid="auto-director-progress-panel"]`, `[data-testid="stage-candidates"]` | Validate candidate generation cards, stage progression indicators, and takeover controls. |

## Standard Automated Testing Procedure

1. **Service Preparation**:
   - Ensure local dev server is running (`http://localhost:5173` for frontend, `http://localhost:3000` for server API).
2. **Subagent & Browser Automation Execution**:
   - Navigate to `http://localhost:5173`.
   - Perform visual DOM extraction & layout integrity check.
   - Test interaction flows:
     - Click Quick Setup / New Novel creation.
     - Inspect Simple Creation mode layout & materials panel.
     - Verify Auto-Director task drawer and progress panel rendering.
3. **Artifact Recording**:
   - Capture page screenshots for layout validation.
   - Record browser interaction session logs for diagnostic review.

## Maintaining Automation Scripts

* Maintained Script: [test-ui-flow.js](file:///c:/Users/lilin/GeneralAgent/scripts/test-ui-flow.js)
* Run via Node: `node scripts/test-ui-flow.js --check`
