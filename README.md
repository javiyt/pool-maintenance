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

## JSON Export / Import Format

The app supports exporting and importing data as JSON files. This makes it possible to back up your data or transfer it between browsers/devices.

### Export

Click **Export JSON** in the Measurement History section to download a `.json` file. The exported file uses the following format (schema version 4):

```json
{
  "schemaVersion": 4,
  "exportedAt": "2026-07-09T10:35:00.000Z",
  "poolConfig": {
    "volume": 50000,
    "volumeUnit": "liters",
    "poolType": "chlorine",
    "unitSystem": "metric"
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
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `schemaVersion` | number | Format version (`4`). Used for forward compatibility. |
| `exportedAt` | string (ISO 8601) | When the file was exported. |
| `poolConfig` | object | The pool settings (volume, type, units) at time of export. |
| `measurements` | array | Array of measurement records with digital meter fields. |
| `actions` | array | Array of maintenance action records (v4+). Empty array if no actions recorded. |

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

Click **Import JSON** and select a `.json` file. The app accepts four formats:

1. **Schema v4** (current) — the full format shown above. Restores measurements, actions, and pool configuration.
2. **Schema v3** (legacy) — format without `actions`. Restores measurements and pool configuration; actions field is silently treated as empty.
3. **Schema v2** (legacy) — old format with `freeChlorine`, `alkalinity`, `cyanuricAcid` fields. These are automatically migrated: `freeChlorine` → `fac`, while `alkalinity` and `cyanuricAcid` are dropped (no longer part of the model).
4. **Schema v1** (legacy) — a plain array of measurement objects. Only imports measurements; pool configuration is not affected.

#### Import behavior

- **Measurements are merged** with existing data. New measurements are appended. If an imported measurement has the same `id` as an existing one, the duplicate is silently skipped.
- **Actions are merged** with existing data using the same id-based dedup logic.
- **Pool configuration is restored** when the imported file contains a `poolConfig` field (schema v2+). The current pool settings are overwritten with the imported values.
- **Backward compatible** — old export files that contain only measurements still work. The app detects the format automatically. Schema v3 exports are fully compatible and imported without data loss.
- **Invalid files** — if the file is not valid JSON, or the structure is unrecognized, the import is canceled and an error message is shown. The app never crashes from a bad import.

### Migration notes

- **Schema v1 → v2 → v3 → v4**: Exports from any previous schema version are fully importable.
- **Date-only records**: Old measurements that use `date` (YYYY-MM-DD) instead of `measuredAt` are automatically converted during import, using local noon as the default time.
- **Old field mapping**: `freeChlorine` → `fac`. Fields `alkalinity`, `cyanuricAcid`, and `date` are removed after migration.
- **Missing values**: Old records that cannot provide all digital meter fields (e.g. migrated v2 records that lacked `ec`, `tds`, `orp`) may have incomplete data. The app requires all fields for new measurements but accepts incomplete migrated records.

## Project Structure

```
src/
├── main.ts                    # Entry point — wires UI panels together
├── domain/
│   ├── settings.ts            # PoolSettings type, defaults
│   ├── measurement.ts         # Measurement type, validation
│   ├── actions.ts             # MaintenanceAction type, action ID generation
│   ├── chemicalCatalog.ts     # Generic chemical product catalog (no brand names)
│   ├── chemistry.ts           # Chemical calculation logic, target ranges, recommendation engine
│   ├── trendAnalysis.ts       # Measurement trend detection (rising/falling/stable)
│   ├── saltChlorinator.ts     # Salt chlorinator adjustment calculator
│   ├── maintenanceAssistant.ts# Full assistant — trends + recommendations + status
│   ├── actionOutcomeEvaluator.ts # Evaluates action effectiveness from before/after measurements
│   └── storage.ts             # localStorage persistence (measurements + actions)
├── ui/
│   ├── settingsPanel.ts       # Pool settings drawer
│   ├── measurementForm.ts     # Measurement input form
│   ├── actionForm.ts          # Maintenance action creation form (drawer)
│   ├── historyPanel.ts        # Measurement history list + export/import
│   ├── actionHistory.ts       # Action history list
│   └── recommendationsPanel.ts # Recommendation results display + "Mark as performed"
├── styles/
│   └── main.css               # All styles (mobile-first, no framework)
tests/
├── chemistry.test.ts          # Catalog + recommendation engine tests
├── measurement.test.ts        # Validation + ID generation tests
├── actions.test.ts            # Action persistence, export/import, merge, sorting tests
├── actionOutcomeEvaluator.test.ts # Action outcome evaluation tests
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

## License

MIT
