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
- **Measurement form** — record pH, free chlorine, alkalinity, cyanuric acid, plus optional salt, temperature and notes.
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
| Free chlorine | 1–3 ppm (chlorine) / 3–5 ppm (saltwater) | Calcium hypochlorite | ~2.5 g / 1,000 L per 1.0 ppm |
| Total alkalinity | 80–120 ppm | Sodium bicarbonate (raise) / sodium bisulfate (lower) | ~18 g / 1,000 L per 10 ppm |
| Cyanuric acid | 30–50 ppm | Cyanuric acid granulate | ~13 g / 1,000 L per 10 ppm |
| Salt (saltwater pools) | 2,700–3,400 ppm | Pool salt | ~1 kg / 1,000 L per 100 ppm |

High cyanuric acid and high salt cannot be chemically reduced — partial drain and refill is the recommended approach.

These rates are rough guidelines. Actual results depend on water temperature, bather load, rainfall, and other factors. **Always measure twice and add chemicals gradually.**

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
