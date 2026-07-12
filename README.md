# Pool Maintenance

Track water chemistry measurements, understand whether your pool water is okay, and get approximate chemical dosage recommendations.

> **Disclaimer:** This tool provides *approximate* recommendations only. Always follow the dosage instructions on your chemical product labels. This is not a substitute for professional pool maintenance advice.

## Screenshots

| New measurement form | Chemical recommendations | Measurement history |
|---|---|---|
| <!-- screenshot-1.png --> | <!-- screenshot-2.png --> | <!-- screenshot-3.png --> |

*(Screenshot placeholders — replace with actual screenshots before publishing.)*

## Features

- **Pool settings** — set your pool volume, type (chlorine / saltwater), and preferred units.
- **Measurement form** — record pH, EC (µS/cm), TDS (ppm), salt (ppm), ORP (mV), FAC (ppm), and temperature (°C) from a digital pool meter.
- **Validation** — prevents impossible values and shows clear error messages.
- **Chemistry recommendations** — get approximate dosage amounts with target ranges and warnings when values are dangerous.
- **Mark recommendations as performed** — convert a recommendation into a recorded maintenance action with pre-filled values you can edit before saving.
- **Maintenance action history** — record chemical additions, chlorinator adjustments, filtration changes, water replacements, cleaning, manual tests, and other actions. View in reverse chronological order, delete entries. Actions can be linked to a specific measurement.
- **Outcome evaluation** — each recorded action is automatically evaluated against before/after measurements. The evaluator detects field changes, accounts for intervening actions, and reports effectiveness (effective, partial, ineffective, unexpected, or unknown) with a confidence level — without claiming causality.
- **Historical learning** — a deterministic module that aggregates action outcomes to reveal observed patterns: typical FAC increase per chlorinator adjustment, pH response to reducer/increaser, FAC response to chlorine granules, and salt level response. Uses robust statistics (median, median absolute deviation) with sample-size-based confidence levels. All calculations are explainable — no machine learning.
- **Personalized recommendations** — where sufficient historical data exists, the assistant adjusts theoretical estimates using observed correction factors. Chlorinator additional hours and chemical dosages are personalized based on how your specific pool has responded to similar actions in the past, while preserving all safety limits.
- **Action follow-up tracking** — when you mark a recommendation as performed, a follow-up record is created to track when to retest. After adding a new measurement, pending follow-ups are automatically evaluated and outcomes are displayed in the dashboard.
- **Exclusion flags** — mark actions as atypical, incorrectly recorded, or excluded from learning. Excluded actions remain visible in history but do not affect historical learning.
- **Unusual event notes** — annotate actions with structured notes for rain, many bathers, refill, cleaning, cover removed, or equipment issues.
- **Historical insights UI** — shows learned patterns with confidence badges and sample counts, plus a clear disclaimer that correlation does not imply causation.
- **Personalization controls** — enable/disable personalization, configure minimum sample requirements, and adjust correction factor bounds in Settings.
- **Measurement history** — view in reverse chronological order, delete entries, export to JSON, and import from JSON.
- **Mobile-first** — responsive layout that works on phones and tablets.
- **Local storage** — all data stays in your browser. No server, no cloud sync.

## Getting Started

This is a [Vite](https://vite.dev/) + [TypeScript](https://www.typescriptlang.org/) project. No backend server is required.

```bash
# Install dependencies
pnpm install

# Start the dev server (opens at http://localhost:5173)
pnpm dev

# Run unit tests
pnpm test

# Type-check
pnpm lint

# Production build
pnpm build
```

After building, the output is in `dist/`. You can serve it with any static file server.

## Calculator Assumptions

The app uses a **generic chemical product catalog** — no commercial brand names are shown. All products are identified by their generic name and active component. Dosage formulas are **approximate** and assume standard residential pool conditions.

The app distinguishes between **chlorine pools** and **saltwater pools**, applying different target ranges and recommendation logic for each.

| Parameter | Chlorine pool | Saltwater pool | Adjustment | Approximate rate |
|---|---|---|---|---|
| pH | 7.2–7.6 | 7.2–7.6 | Reductor de pH líquido / Incrementador de pH líquido | ~750 ml / 50 m³ per 0.1 pH (lower); ~1 L / 50 m³ per 0.1 pH (raise) |
| FAC (free available chlorine) | 1–3 ppm | 0.8–2.5 ppm | Cloro granulado | 3 g/m³ (maintenance); 25 g/m³ (shock) |
| ORP | ≥650 mV | ≥650 mV | — (sanitation indicator) | N/A — monitored, not chemically adjusted directly |
| Salt (saltwater pools) | — | 2,700–3,400 ppm | Sal para piscina (cloruro sódico) | Estimated from ppm: kg = deltaPpm × volumeL / 1,000,000 |
| EC | Informational | Informational | — | N/A |
| TDS | Informational | Informational | — | N/A |

### Pool type behavior

- **Chlorine pools**: Uses FAC as the main chlorine indicator. If FAC is low and pH is acceptable, recommends cloro granulado. If pH is out of range, recommends pH correction first.
- **Saltwater pools**: Uses salt as an important measured value. If salt is low, recommends sal para piscina. If FAC is low, first suggests checking the salt chlorinator; cloro granulado is reserved for corrective/shock treatment when FAC and/or ORP are critically low.

### Conservative dosing

- pH corrections are capped at 0.2 units per treatment cycle to avoid overshooting.
- Always retest before adding more chemicals.
- pH increaser and pH reducer are never recommended together.
- Chlorine is not recommended aggressively when pH is far outside range.

### Temperature

Water temperature above 30 °C increases chlorine demand. A warning is shown when applicable.

### Limitations

- The digital meter does not measure **cyanuric acid** (chlorine stabilizer). The app shows an informational note to measure it manually before adding stabilizer.
- The digital meter does not measure **total alkalinity**. The app shows an informational note to measure it manually before adding alkalinity reducer.
- High salt cannot be chemically reduced — partial drain and refill is the only option.
- EC and TDS are used as informational/supporting values only.

These rates are rough guidelines. Actual results depend on water temperature, bather load, rainfall, and other factors. **Always measure twice and add chemicals gradually.**

## Historical Learning

The app includes a **deterministic historical learning module** that aggregates action outcomes to reveal observed patterns in your data. All calculations are explainable and use robust statistics — no machine learning.

### How it works

1. **Outcome evaluation**: Each recorded maintenance action is evaluated against before/after measurements by `actionOutcomeEvaluator.ts`, producing an `ActionOutcome` with field changes, effectiveness, and confidence.
2. **Eligibility filtering**: Outcomes are filtered to exclude:
   - Unknown effectiveness
   - Very low confidence (< 0.3)
   - Non-evaluable action kinds (manual-test, cleaning, other)
   - Chemical actions without a measurable product type (alkalinity-reducer, chlorine-stabilizer)
3. **Grouping**: Eligible outcomes are grouped by:
   - Action kind + product type (e.g., `chemical:ph-reducer`, `chlorinator`)
   - Pool type (chlorine / saltwater)
   - Metric affected (pH, FAC, salt)
   - Temperature band (cold < 15°C, normal 15–25°C, warm 25–30°C, hot ≥ 30°C)
   - Chlorinator output percent band (0–20, 21–40, 41–60, 61–80, 81–100%)
4. **Robust statistics**: For each group, the module computes:
   - **Median** — the primary learned effect (resistant to outliers)
   - **Mean** — for display only
   - **Median absolute deviation (MAD)** — a robust measure of dispersion
5. **Confidence levels**:
   - Fewer than 3 samples: `none` (no usable learning)
   - 3–4 samples: `low`
   - 5–9 samples: `medium`
   - 10+ samples: `high`
   - Confidence is reduced if dispersion (MAD/median ratio) is high
6. **Correction factor**: Where a theoretical effect can be estimated (pool volume is configured), a correction factor is calculated as `observed effect / theoretical effect`, clamped to 0.5–1.5. These factors are **not applied to recommendations** — they are informational only.

### What the insights show

| Insight | Description |
|---|---|
| FAC increase per chlorinator adjustment | Observed median FAC change after chlorinator output adjustments, grouped by output band and temperature band |
| FAC response to chlorine granules | Observed median FAC change after chlorine granules application |
| pH response to reducer/increaser | Observed median pH change after pH reducer or pH increaser application |
| Salt level response to salt addition | Observed median salt increase after pool salt application |

Each insight includes:
- The observed median value with sign
- Sample count
- Confidence badge (High / Medium / Low)
- A disclaimer that correlation does not imply causation

### Key design decisions

- **Not persisted**: Learned statistics are recalculated from raw measurement and action records on every render.
- **Recommendation personalization**: Where sufficient historical data exists, the assistant adjusts theoretical estimates using observed correction factors. This is a separate step after the theoretical calculation — the baseline recommendation remains visible.
- **Deterministic**: All calculations are pure functions of the input data, producing identical results on repeated calls.
- **Temperature and output bands**: Observations are grouped by temperature and chlorinator output bands when this data is available, keeping incompatible conditions separate.

### Personalization rules

The assistant personalizes recommendations only when:

1. **Historical learning is enabled** in Settings.
2. **Enough comparable samples exist** — at least 5 (configurable) outcomes for the same action type, metric, and pool type.
3. **Confidence is medium or high** — low confidence is informational only (unless "apply low confidence" is explicitly enabled).
4. **Dispersion is acceptable** — observations that are too scattered reduce confidence.

For **chlorinator recommendations**, the estimated additional hours are adjusted by the observed FAC production correction factor. The personalized value never exceeds the configured maximum daily hours.

For **chemical recommendations** (chlorine granules), the estimated amount is adjusted by the observed FAC response correction factor. The personalized value never exceeds the per-treatment shock cap (25 g/m³).

The following are **never personalized**:
- Danger thresholds and safety warnings
- Bathing safety advice
- Maximum chemical treatment caps
- pH/chlorine ordering (pH correction always comes first)
- Missing-measurement warnings

### Personalization UI

When a recommendation is personalized, the UI shows:
- The **theoretical estimate** (struck through)
- The **personalized estimate** (highlighted)
- The **historical sample size**
- **Confidence badge** (High / Medium)
- An **explanation** describing what was observed and how the estimate was adjusted

### Historical learning configuration

| Setting | Default | Description |
|---|---|---|
| Enabled | true | Master switch for recommendation personalization |
| Minimum samples | 5 | Minimum comparable outcomes required before personalization is attempted |
| Apply low confidence | false | When enabled, also applies corrections from low-confidence (3–4 sample) adjustments |
| Min correction factor | 0.5 | Lower bound for the correction factor (prevents excessive downward adjustment) |
| Max correction factor | 1.5 | Upper bound for the correction factor (prevents excessive upward adjustment) |

## JSON Export / Import Format

The app supports exporting and importing data as JSON files. This makes it possible to back up your data or transfer it between browsers/devices.

### Export

Click **Export JSON** in the Measurement History section to download a `.json` file. The exported file uses the following format (schema version 6):

```json
{
  "schemaVersion": 6,
  "exportedAt": "2026-07-09T10:35:00.000Z",
  "poolConfig": {
    "volume": 50000,
    "volumeUnit": "liters",
    "poolType": "chlorine",
    "unitSystem": "metric",
    "historicalLearning": {
      "enabled": true,
      "minimumSamples": 5,
      "applyLowConfidence": false,
      "minCorrectionFactor": 0.5,
      "maxCorrectionFactor": 1.5
    }
  },
  "measurements": [
    {
      "id": "1700000000-a1b2c3",
      "measuredAt": "2026-07-09T10:35:00.000Z",
      "ph": 7.4,
      "ec": 6640,
      "tds": 3230,
      "salt": 3380,
      "orp": 672,
      "fac": 0.8,
      "temperature": 31.0
    }
  ],
  "actions": [
    {
      "id": "act-1741592100-1-abc12",
      "performedAt": "2026-07-09T11:00:00.000Z",
      "kind": "chemical",
      "description": "Added pH reducer",
      "notes": "Applied around the perimeter",
      "relatedMeasurementId": "1700000000-a1b2c3",
      "chemical": {
        "productType": "ph-reducer",
        "mainComponent": "Ácido reductor de pH",
        "amount": 750,
        "unit": "ml"
      }
    }
  ],
  "followUps": [
    {
      "id": "fu-1741592100-1-a1b2",
      "actionId": "act-1741592100-1-abc12",
      "recommendationId": "ma-1741592100-1",
      "sourceMeasurementId": "1700000000-a1b2c3",
      "suggestedRetestDelay": 6,
      "status": "awaiting-retest",
      "createdAt": "2026-07-09T11:00:00.000Z",
      "dueAt": "2026-07-09T17:00:00.000Z",
      "excludedFromLearning": false,
      "atypical": false,
      "incorrectlyRecorded": false,
      "unusualEventNotes": []
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `schemaVersion` | number | Format version (`6`). Used for forward compatibility. |
| `exportedAt` | string (ISO 8601) | When the file was exported. |
| `poolConfig` | object | The pool settings (volume, type, units) at time of export. |
| `measurements` | array | Array of measurement records with digital meter fields. |
| `actions` | array | Array of maintenance action records (v4+). Empty array if no actions recorded. |
| `followUps` | array | Array of action follow-up records (v6+). Empty array if none. |

### Measurement fields

| Field | Unit | Description |
|---|---|---|
| `id` | — | Unique identifier |
| `measuredAt` | ISO 8601 | Date and time of the measurement |
| `ph` | — | pH level |
| `ec` | µS/cm | Electrical conductivity |
| `tds` | ppm | Total dissolved solids |
| `salt` | ppm | Salt level |
| `orp` | mV | Oxidation-reduction potential |
| `fac` | ppm | Free available chlorine |
| `temperature` | °C | Water temperature |

### Import

Click **Import JSON** and select a `.json` file. The app accepts six formats:

1. **Schema v6** (current) — the full format shown above. Restores measurements, actions, follow-ups, pool configuration, and historical learning settings.
2. **Schema v5** (legacy) — full format with historical learning config but without follow-ups. Restores measurements, actions, and pool configuration.
3. **Schema v4** (legacy) — full format without historical learning config. Restores measurements, actions, and pool configuration; learning defaults are used.
4. **Schema v3** (legacy) — format without `actions`. Restores measurements and pool configuration; actions field is silently treated as empty.
5. **Schema v2** (legacy) — old format with `freeChlorine`, `alkalinity`, `cyanuricAcid` fields. These are automatically migrated: `freeChlorine` → `fac`, while `alkalinity` and `cyanuricAcid` are dropped (no longer part of the model).
6. **Schema v1** (legacy) — a plain array of measurement objects. Only imports measurements; pool configuration is not affected.

#### Import behavior

- **Measurements are merged** with existing data. New measurements are appended. If an imported measurement has the same `id` as an existing one, the duplicate is silently skipped.
- **Actions are merged** with existing data using the same id-based dedup logic.
- **Follow-ups are merged** with existing data using the same id-based dedup logic (v6+).
- **Pool configuration is restored** when the imported file contains a `poolConfig` field (schema v2+). The current pool settings are overwritten with the imported values.
- **Backward compatible** — old export files that contain only measurements still work. The app detects the format automatically. Schema v3 exports are fully compatible and imported without data loss.
- **Invalid files** — if the file is not valid JSON, or the structure is unrecognized, the import is canceled and an error message is shown. The app never crashes from a bad import.

### Migration notes

- **Schema v1 → v2 → v3 → v4 → v5 → v6**: Exports from any previous schema version are fully importable.
- **Follow-ups**: v6 additions include follow-up tracking records. v5 and older exports won't have this field; it defaults to an empty array on import.
- **Historical learning config**: v5 exports include `historicalLearning` in `poolConfig`. v4 exports without this field use default settings on import.
- **Date-only records**: Old measurements that use `date` (YYYY-MM-DD) instead of `measuredAt` are automatically converted during import, using local noon as the default time.
- **Old field mapping**: `freeChlorine` → `fac`. Fields `alkalinity`, `cyanuricAcid`, and `date` are removed after migration.
- **Missing values**: Old records that cannot provide all digital meter fields (e.g. migrated v2 records that lacked `ec`, `tds`, `orp`) may have incomplete data. The app requires all fields for new measurements but accepts incomplete migrated records.

## Project Structure

```
src/
├── main.ts                    # Entry point — wires UI panels together
├── domain/
│   ├── settings.ts            # PoolSettings type, defaults, HistoricalLearningConfig
│   ├── measurement.ts         # Measurement type, validation
│   ├── actions.ts             # MaintenanceAction type, action ID generation
│   ├── followUp.ts            # FollowUp type, state machine, dashboard queries
│   ├── chemicalCatalog.ts     # Generic chemical product catalog (no brand names)
│   ├── chemistry.ts           # Chemical calculation logic, target ranges, recommendation engine
│   ├── trendAnalysis.ts       # Measurement trend detection (rising/falling/stable)
│   ├── saltChlorinator.ts     # Salt chlorinator adjustment calculator
│   ├── maintenanceAssistant.ts# Full assistant — trends + recommendations + personalization
│   ├── actionOutcomeEvaluator.ts # Evaluates action effectiveness from before/after measurements
│   ├── historicalLearning.ts  # Deterministic historical learning + correction factors
│   └── storage.ts             # localStorage persistence (measurements + actions + follow-ups)
├── ui/
│   ├── settingsPanel.ts       # Pool settings drawer
│   ├── measurementForm.ts     # Measurement input form
│   ├── actionForm.ts          # Maintenance action creation form (drawer)
│   ├── historyPanel.ts        # Measurement history list + export/import
│   ├── actionHistory.ts       # Action history list
│   ├── followUpDashboard.ts   # Action follow-up dashboard with flags and notes
│   ├── recommendationsPanel.ts # Recommendation results display + "Mark as performed"
│   └── historicalInsights.ts  # Historical insights panel
├── styles/
│   └── main.css               # All styles (mobile-first, no framework)
tests/
├── chemistry.test.ts          # Catalog + recommendation engine tests
├── measurement.test.ts        # Validation + ID generation tests
├── actions.test.ts            # Action persistence, export/import, merge, sorting tests
├── followUp.test.ts           # Follow-up state machine, dashboard, exclusion, lifecycle tests
├── actionOutcomeEvaluator.test.ts # Action outcome evaluation tests
├── historicalLearning.test.ts # Historical learning tests (48 tests)
├── storage.test.ts            # Settings + measurement persistence + export/import tests
└── maintenanceAssistant.test.ts # Full assistant integration tests
```

Domain logic is fully separated from UI code, making the calculation engine testable and reusable.

## Tech Stack

- [Vite](https://vite.dev/) — dev server and build tool
- [TypeScript](https://www.typescriptlang.org/) — type safety
- [Vitest](https://vitest.dev/) — unit testing
- Vanilla DOM APIs — no framework, no heavy dependencies

## Deployment

The app can be deployed to a Raspberry Pi (or any Linux host) using Podman Quadlets
and systemd user services. See [deploy/README.md](deploy/README.md) for full instructions.

### Quick overview

| Step | Details |
|---|---|
| **Image** | `ghcr.io/javiyt/pool-maintenance:latest` |
| **Architecture** | `linux/amd64` + `linux/arm64` (Raspberry Pi compatible) |
| **Build** | Automatic on every push to `main` via GitHub Actions |
| **Container runtime** | Podman (rootless) |
| **Service manager** | systemd user services |
| **Container definition** | Quadlet (native Podman systemd integration) |

### Deploy in one command

```bash
./deploy/deploy.sh --host <raspberry-pi-ip> --user pi
```

### Check status on the Pi

```bash
systemctl --user status pool-maintenance.service
journalctl --user -u pool-maintenance.service -f
podman ps
```

See [deploy/README.md](deploy/README.md) for details on installation, rollback,
auto-update, and uninstallation.

## GitHub Pages

This project is also deployed to **GitHub Pages** for quick browser access without
any local setup.

| Item | Details |
|---|---|
| **URL** | [https://javiyt.github.io/pool-maintenance/](https://javiyt.github.io/pool-maintenance/) |
| **Trigger** | Every push to `main` (or manual `workflow_dispatch`) |
| **Source** | [`.github/workflows/pages.yml`](.github/workflows/pages.yml) |

### Required repository setting

Before the first deployment, configure the Pages source:

1. Open the repository **Settings** → **Pages**.
2. Under **Build and deployment**, select **GitHub Actions** as the source.
3. No further configuration is needed — the workflow handles the rest.

### Build locally for Pages

```bash
pnpm build:pages
```

This sets the asset base path to `/pool-maintenance/` so all CSS and JavaScript
load correctly on the Pages domain. Verify the output:

```bash
grep -o '/pool-maintenance/assets/' dist/index.html | head -1
```

### Normal (root) build

```bash
pnpm build
```

This is the default build used for local previews and the Docker/Raspberry Pi
deployment. Asset paths are rooted at `/`.

### Data persistence

The app uses **browser `localStorage`** — all data stays in your browser.
There is no server, no shared database, and no automatic synchronisation between
devices or deployments.

| Environment | Storage scope |
|---|---|
| `http://localhost:5173` | Local dev — isolated data |
| `http://raspberry-pi:8090` | Docker/Raspberry Pi — isolated data |
| `https://javiyt.github.io/pool-maintenance/` | GitHub Pages — isolated data |

To move data between environments, use the **JSON export/import** feature:

1. On the source deployment, click **Export JSON** in Measurement History.
2. On the target deployment, click **Import JSON** and select the downloaded file.
3. All measurements, actions, and settings are restored.

## License

MIT
