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

All chemical dosage formulas are **approximate** and assume standard residential pool conditions.

| Parameter | Target range | Adjustment | Approximate rate |
|---|---|---|---|
| pH | 7.2–7.6 | Sodium bisulfate (lower) / sodium carbonate (raise) | ~15 g / 1,000 L per 0.1 pH (lower); ~12 g / 1,000 L per 0.1 pH (raise) |
| FAC (free available chlorine) | 1–3 ppm (chlorine) / 3–5 ppm (saltwater) | Calcium hypochlorite | ~2.5 g / 1,000 L per 1.0 ppm |
| ORP | 650–800 mV | — (sanitation indicator) | N/A — monitored, not chemically adjusted directly |
| Salt (saltwater pools) | 2,700–3,400 ppm | Pool salt | ~1 kg / 1,000 L per 100 ppm |
| EC | Informational | — | N/A |
| TDS | Informational | — | N/A |

High salt cannot be chemically reduced — partial drain and refill is the recommended approach.

These rates are rough guidelines. Actual results depend on water temperature, bather load, rainfall, and other factors. **Always measure twice and add chemicals gradually.**

## JSON Export / Import Format

The app supports exporting and importing data as JSON files. This makes it possible to back up your data or transfer it between browsers/devices.

### Export

Click **Export JSON** in the Measurement History section to download a `.json` file. The exported file uses the following format (schema version 3):

```json
{
  "schemaVersion": 3,
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
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `schemaVersion` | number | Format version (`3`). Used for forward compatibility. |
| `exportedAt` | string (ISO 8601) | When the file was exported. |
| `poolConfig` | object | The pool settings (volume, type, units) at time of export. |
| `measurements` | array | Array of measurement records with digital meter fields. |

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

Click **Import JSON** and select a `.json` file. The app accepts three formats:

1. **Schema v3** (current) — the full format shown above. Restores both measurements and pool configuration using the new digital meter fields.
2. **Schema v2** (legacy) — old format with `freeChlorine`, `alkalinity`, `cyanuricAcid` fields. These are automatically migrated: `freeChlorine` → `fac`, while `alkalinity` and `cyanuricAcid` are dropped (no longer part of the model).
3. **Schema v1** (legacy) — a plain array of measurement objects. Only imports measurements; pool configuration is not affected.

#### Import behavior

- **Measurements are merged** with existing data. New measurements are appended. If an imported measurement has the same `id` as an existing one, the duplicate is silently skipped.
- **Pool configuration is restored** when the imported file contains a `poolConfig` field (schema v2+). The current pool settings are overwritten with the imported values.
- **Backward compatible** — old export files that contain only measurements still work. The app detects the format automatically.
- **Invalid files** — if the file is not valid JSON, or the structure is unrecognized, the import is canceled and an error message is shown. The app never crashes from a bad import.

### Migration notes

- **Schema v1 → v2 → v3**: Exports from any previous schema version are fully importable.
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
│   ├── chemistry.ts           # Chemical calculation logic, target ranges
│   └── storage.ts             # localStorage persistence
├── ui/
│   ├── settingsPanel.ts       # Pool settings drawer
│   ├── measurementForm.ts     # Measurement input form
│   ├── historyPanel.ts        # Measurement history list + export/import
│   └── recommendationsPanel.ts # Recommendation results display
└── styles/
    └── main.css               # All styles (mobile-first, no framework)
tests/
├── chemistry.test.ts
├── measurement.test.ts
└── storage.test.ts
```

Domain logic is fully separated from UI code, making the calculation engine testable and reusable.

## Tech Stack

- [Vite](https://vite.dev/) — dev server and build tool
- [TypeScript](https://www.typescriptlang.org/) — type safety
- [Vitest](https://vitest.dev/) — unit testing
- Vanilla DOM APIs — no framework, no heavy dependencies

## License

MIT
