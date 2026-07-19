# Diagnosis and Recommendation Architecture

Pool Maintenance Assistant now has an incremental two-phase domain flow:

1. `runDiagnosisEngine` answers what is happening in the pool.
2. `runRecommendationEngine` answers what to propose for those diagnoses.

The diagnosis layer must not propose products, doses, equipment hours, or UI text. The structured recommendation layer must not discover pool problems by re-reading raw measurements; it reacts to `Diagnosis.code`, evidence, and configuration.

## Adding a Diagnosis

1. Add the stable code to `src/domain/diagnosis/diagnosisCode.ts`.
2. Add or update a rule in `src/domain/diagnosis/diagnosisEngine.ts`, in the appropriate phase:
   - atomic value
   - trend
   - persistence
   - action outcome
   - composite
3. Emit structured `DiagnosisEvidence`, not localized text.
4. Include source ids and missing inputs when relevant.
5. Add unit tests in `tests/diagnosisEngine.test.ts`.

## Adding a Diagnosis Rule

Rules must be deterministic and explainable. They should:

- consume `DiagnosisContext`;
- produce `DiagnosisDraft` data only;
- avoid recommendation/action vocabulary;
- use stable evidence codes;
- avoid cycles by respecting the engine phase order.

## Adding a Recommendation

1. Add the stable code to `src/domain/recommendation/recommendationCode.ts`.
2. Add a `RecommendationRule` under `src/domain/recommendation/rules/`.
3. Declare `requiredDiagnosisCodes` and `excludedDiagnosisCodes`.
4. Populate `sourceDiagnosisIds`, `generatedByRuleIds`, dependencies, contraindications, safety codes, and explanation codes.
5. Add resolver behavior when the recommendation can duplicate or supersede another recommendation.

## Adding a Recommendation Rule

Rules must:

- match using diagnosis codes and structured evidence;
- avoid interpreting raw measurements to discover problems;
- generate deterministic recommendations;
- avoid mutating context;
- be tested in isolation.

## Migration

The legacy `runAssistant` format remains for the current UI. New structured artifacts are exported separately:

- `diagnoses`
- `recommendations`
- `recommendationPlans`
- `actionOutcomes`
- `historicalLearningState`

Legacy adapters live under `src/infrastructure/migrations/` so compatibility does not leak into the new domain contracts.

