# Recommendation Engine V2

## Goals

The recommendation system remains deterministic and rule-based. No AI, model fitting, neural networks, or predictive black boxes are used.

The V2 change makes the assistant reason from pool history instead of only the latest measurement. All derived data remains recalculable from raw measurements, actions, follow-ups, settings, and catalog versions.

## Components

New domain logic lives under `src/domain/recommendation`:

- `chemicalDoseCalculator.ts`: calculates FAC and pH doses from product catalog data, pool volume, current value, and target value.
- `chlorineModel.ts`: separates theoretical chlorine production, chlorine demand reserve, and expected observable FAC increase.
- `confidenceCalculator.ts`: computes outcome confidence with explicit reductions for attribution risks.
- `recommendationEscalationEngine.ts`: classifies FAC recovery strategy as `NORMAL`, `PERSISTENT`, `CRITICAL`, or `DIAGNOSTIC`.
- `recommendationSnapshot.ts`: captures recommendation inputs, outputs, calculations, versions, dependencies, and notes when a recommendation is converted into an action.
- `versions.ts`: separates application, recommendation engine, outcome evaluator, and chemical catalog versions.

`maintenanceAssistant.ts` stays as the orchestration boundary for the current architecture. It now accepts actions as an optional third argument and remains backwards compatible with existing two-argument calls.

## Escalation Rules

Escalation is deterministic and based on recent low FAC measurements, chlorine recovery attempts, evaluated outcomes, confidence, and persistence.

- `NORMAL`: latest state can be handled by the standard recommendation flow.
- `PERSISTENT`: repeated low FAC or multi-day persistence; diagnostic recommendations become visible.
- `CRITICAL`: repeated low FAC plus multiple attempts with at least one ineffective or unexpected result.
- `DIAGNOSTIC`: repeated low FAC plus several attempts and multiple ineffective or unexpected results.

For saltwater pools with acceptable pH and persistent low FAC, the assistant no longer only repeats chlorinator increases. It adds equipment inspection, manual FAC verification, total chlorine, cyanuric acid, cell inspection, flow checks, scaling checks, and temporary fast chlorine when history warrants it.

## Chemical Dosing

Chlorine granules no longer use a fixed shock dose. The catalog defines available chlorine percent, stabilization, concentration metadata, safety notes, limitations, and recommended dose semantics.

FAC dose calculation uses:

```text
active chlorine grams = FAC deficit ppm * volume liters / 1000
product grams = active chlorine grams / available chlorine fraction
```

The assistant classifies chlorine work as:

- `maintenance-correction`
- `rapid-correction`
- `shock-treatment`

Classification uses FAC deficit, ORP, persistent history, water clarity, algae, and bather load.

## Outcome Evaluator V2

The evaluator states are:

- `effective`
- `partially-effective`
- `ineffective`
- `unexpected`
- `inconclusive`
- `unknown`

Small changes inside measurement error are `inconclusive`, not partially effective. A result is also inconclusive when too many context variables make attribution unreliable.

Evaluation windows are product-aware. Outcomes preserve all after-measurement observations as `early-observation`, `preferred`, `maximum`, or `late`, while still exposing the selected observation through the existing outcome fields.

Follow-ups can still become `expired` when no measurement exists, but a later valid outcome marks them as `completed-late` instead of discarding the learning opportunity.

## Export And Compatibility

The export schema is now v8 because the JSON payload includes separate version fields:

- `schemaVersion`
- `applicationVersion`
- `recommendationEngineVersion`
- `outcomeEvaluatorVersion`
- `chemicalCatalogVersion`

Existing imports remain backwards compatible with legacy measurement arrays and versioned exports through v7.

Actions can now include an optional `recommendationSnapshot`. Existing actions without snapshots remain valid.

## User-Visible Behavior Changes

- Persistent low FAC in saltwater pools can produce diagnostic and temporary fast-chlorine recommendations even when the chlorinator is configured.
- Chlorine granule amounts can differ from previous results because they are now calculated from available chlorine concentration, not a fixed g/m3 assumption.
- Some action outcomes that were previously `partially-effective` are now `inconclusive`.
- Late follow-up measurements can appear as `completed-late`.
- Exported JSON includes richer version metadata and optional recommendation snapshots.

