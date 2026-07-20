# Pool Maintenance Assistant PWA Redesign Audit

## Visual Audit

Current UI issues found before implementation:

- Single narrow column on all breakpoints; desktop wasted available space and mobile had no dedicated thumb navigation.
- Most screens used identical bordered cards, which made hierarchy flat.
- Measurement, action, settings, recommendation and history areas were visually dense and mixed primary actions with secondary details.
- Settings and action forms were long drawers with many fields and limited section rhythm.
- Several visible labels in the HTML were not yet backed by `data-i18n`.
- Existing drawer had focus handling, but the broader app lacked route-level landmarks and active navigation state.
- Offline/install/update states were absent from the UI.
- Safe-area handling existed only in drawers, not global navigation, banners or app chrome.
- No dark/system appearance preference existed in persisted settings or backups.

Automated screenshots were not captured in this environment because Playwright/Chromium are not installed locally. The attempted tool check found no browser runner. Manual or CI browser screenshots should be added in the next pass.

## Component Inventory

Existing reusable components:

- `SettingsPanel`
- `MeasurementForm`
- `RecommendationsPanel`
- `ActionForm`
- `HistoryPanel`
- `ActionHistory`
- `HistoricalInsightsPanel`
- `FollowUpDashboard`

New reusable pieces added:

- `AppShell`
- `DashboardPanel`
- `PwaController`
- PWA install/offline/update helpers
- Theme helper
- Measurement-card CSS pattern
- Status badges
- Bottom and side navigation
- Install card
- Update banner
- Offline indicator

## Navigation

Previous map:

- Single scroll page
- Settings drawer
- Action form drawer

Proposed and implemented first-pass map:

- `/`
- `/measurements/new`
- `/actions`
- `/history`
- `/products`
- `/equipment`
- `/settings`
- `/settings/install`
- `/settings/backup`

The nginx config already supports SPA fallback with `try_files ... /index.html`, so direct route opens are supported in that deployment path.

## Design Tokens

Tokens are CSS custom properties under `:root` and `:root[data-theme="dark"]`:

- colors: background, surface, elevated/subtle surfaces, text, border, primary, success, warning, danger, info, focus
- spacing: `--space-1` through `--space-8`
- radius: small, medium, large
- elevation: raised, panel
- controls: height and icon size
- layout: content max, form max, sidebar width
- safe areas: top/right/bottom/left

Component CSS consumes semantic tokens rather than raw per-component color scales.

## Responsive Strategy

- Mobile first: bottom navigation, single-column content, sticky form footer, safe-area bottom padding.
- Tablet/desktop: side navigation at `860px`, wider dashboard grids, constrained form width.
- Fixed-format elements use stable grid/card dimensions to avoid layout shifting.

## PWA Strategy

Implemented:

- `public/app.webmanifest`
- PNG icon set including maskable icons and Apple touch icon
- SVG favicon
- iOS web app metadata
- `display: standalone`
- service worker registered only in production
- app shell navigation fallback in service worker
- cache-first strategy for icons/assets
- update banner that does not reload over unsaved form changes
- Android `beforeinstallprompt` flow with temporary dismissal
- iOS manual install instructions
- standalone detection with `display-mode` and iOS fallback

## Offline Strategy

The app remains local-first. User data stays in existing persistence and is not stored in Cache Storage. Offline support covers opening the app shell after first load, viewing local data, recording local measurements/actions and exporting/importing local files.

## Update Strategy

The service worker installs updated assets in the background. The UI shows a non-blocking update banner when an update is waiting. It only calls `SKIP_WAITING` after the user chooses to update and no form reports unsaved changes.

## Incremental Plan

Completed in this pass:

1. Tokens and visual foundations.
2. App shell and navigation.
3. Dashboard summary and measurement cards.
4. PWA metadata, icons and service worker.
5. Install/offline/update UI states.
6. Theme preference persisted in settings and backups.
7. Unit tests for new PWA/theme/router helpers.

Recommended next phases:

1. Convert action history and follow-ups into one unified timeline.
2. Split settings and action drawers into mobile sheets/full-page flows.
3. Add product/equipment management screens instead of placeholder routing.
4. Add E2E browser tests for iPhone, Android, iPad, desktop, standalone and offline.
5. Add Lighthouse/axe CI reports and before/after screenshot artifacts.
