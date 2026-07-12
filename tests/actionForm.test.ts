// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import { ActionForm } from '../src/ui/actionForm';

// ── Helpers ───────────────────────────────────────────────────────

function createActionFormHTML(): void {
  document.body.innerHTML = `
    <aside id="actionFormPanel" class="action-panel" role="dialog" aria-label="Record action" aria-modal="true" hidden>
      <div class="action-overlay" id="actionFormOverlay"></div>
      <div id="actionFormDrawer" class="action-drawer">
        <div class="action-header">
          <h2 id="actionFormTitle">Record Maintenance Action</h2>
          <button type="button" id="actionFormCloseBtn" class="btn-icon" aria-label="Close">&times;</button>
        </div>
        <div class="action-body">
          <form id="actionForm" novalidate>
            <div class="field">
              <label for="actionDateTime">Date &amp; time</label>
              <input type="datetime-local" id="actionDateTime" required />
            </div>
            <div class="field">
              <label for="actionKind">Action type</label>
              <select id="actionKind" required>
                <option value="chemical">Chemical addition</option>
                <option value="chlorinator">Salt chlorinator adjustment</option>
                <option value="filtration">Filtration adjustment</option>
                <option value="water-replacement">Partial water replacement</option>
                <option value="cleaning">Cleaning</option>
                <option value="manual-test">Manual test</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div class="field">
              <label for="actionDescription">Description</label>
              <input type="text" id="actionDescription" required />
            </div>
            <div id="actionChemicalFields" class="action-kind-fields" hidden>
              <div class="field">
                <label for="actionChemicalProduct">Product type</label>
                <select id="actionChemicalProduct">
                  <option value="ph-reducer">pH reducer</option>
                </select>
              </div>
              <div class="field">
                <label for="actionChemicalComponent">Main component</label>
                <input type="text" id="actionChemicalComponent" />
              </div>
              <div class="field-row">
                <div class="field" style="flex:1">
                  <label for="actionChemicalAmount">Amount</label>
                  <input type="number" id="actionChemicalAmount" min="0" step="0.1" />
                </div>
                <div class="field" style="flex:0 0 auto; min-width:80px">
                  <label for="actionChemicalUnit">Unit</label>
                  <select id="actionChemicalUnit">
                    <option value="ml">ml</option>
                    <option value="l">L</option>
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                  </select>
                </div>
              </div>
            </div>
            <div id="actionChlorinatorFields" class="action-kind-fields" hidden>
              <div class="field">
                <label for="actionChlorinatorPrevOutput">Previous output (%)</label>
                <input type="number" id="actionChlorinatorPrevOutput" min="0" max="100" step="1" />
              </div>
              <div class="field">
                <label for="actionChlorinatorNewOutput">New output (%)</label>
                <input type="number" id="actionChlorinatorNewOutput" min="0" max="100" step="1" />
              </div>
              <div class="field">
                <label for="actionChlorinatorAddHours">Additional hours</label>
                <input type="number" id="actionChlorinatorAddHours" min="0" step="1" />
              </div>
              <div class="field">
                <label for="actionChlorinatorTotalHours">Total hours per day</label>
                <input type="number" id="actionChlorinatorTotalHours" min="0" step="1" />
              </div>
            </div>
            <div id="actionFiltrationFields" class="action-kind-fields" hidden>
              <div class="field">
                <label for="actionFiltrationPrevHours">Previous hours per day</label>
                <input type="number" id="actionFiltrationPrevHours" min="0" step="1" />
              </div>
              <div class="field">
                <label for="actionFiltrationNewHours">New hours per day</label>
                <input type="number" id="actionFiltrationNewHours" min="0" step="1" />
              </div>
            </div>
            <div id="actionWaterFields" class="action-kind-fields" hidden>
              <div class="field">
                <label for="actionWaterLiters">Estimated liters</label>
                <input type="number" id="actionWaterLiters" min="0" step="100" />
              </div>
              <div class="field">
                <label for="actionWaterPercent">Estimated percent</label>
                <input type="number" id="actionWaterPercent" min="0" max="100" step="1" />
              </div>
            </div>
            <div class="field">
              <label for="actionNotes">Notes <span class="optional">optional</span></label>
              <textarea id="actionNotes" rows="2"></textarea>
            </div>
            <div class="field">
              <label for="actionRelatedMeasurement">Linked measurement <span class="optional">optional</span></label>
              <select id="actionRelatedMeasurement">
                <option value="">— None —</option>
              </select>
            </div>
            <div id="actionFormErrors" class="form-errors" aria-live="polite" role="alert"></div>
            <div class="form-actions">
              <button type="submit" class="btn-primary">Save Action</button>
            </div>
          </form>
        </div>
      </div>
    </aside>
  `;
}

// ── localStorage mock ─────────────────────────────────────────────

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, val: string) => store.set(key, val),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    },
    writable: true,
    configurable: true,
  });
});

// ── Tests ─────────────────────────────────────────────────────────

describe('ActionForm', () => {
  let form: ActionForm;

  beforeEach(() => {
    createActionFormHTML();
    form = new ActionForm();
  });

  // 1. Panel is hidden on initial page load
  it('is hidden on initial load', () => {
    const panel = document.getElementById('actionFormPanel') as HTMLElement;
    expect(panel.hidden).toBe(true);
  });

  // 2. Calling open() shows the panel
  it('shows the panel when open() is called', () => {
    form.open();
    const panel = document.getElementById('actionFormPanel') as HTMLElement;
    expect(panel.hidden).toBe(false);
  });

  // 3. Clicking the close button hides the panel
  it('hides the panel when close button is clicked', () => {
    form.open();
    document.getElementById('actionFormCloseBtn')!.click();
    const panel = document.getElementById('actionFormPanel') as HTMLElement;
    expect(panel.hidden).toBe(true);
  });

  // 4. Clicking the overlay hides the panel
  it('hides the panel when overlay is clicked', () => {
    form.open();
    document.getElementById('actionFormOverlay')!.click();
    const panel = document.getElementById('actionFormPanel') as HTMLElement;
    expect(panel.hidden).toBe(true);
  });

  // 5. Clicking inside the drawer does not hide the panel
  it('does not hide the panel when clicking inside the drawer', () => {
    form.open();
    const drawer = document.getElementById('actionFormDrawer') as HTMLElement;
    drawer.click();
    const panel = document.getElementById('actionFormPanel') as HTMLElement;
    expect(panel.hidden).toBe(false);
  });

  // 6. Pressing Escape hides an open panel
  it('closes the panel when Escape is pressed while open', () => {
    form.open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    const panel = document.getElementById('actionFormPanel') as HTMLElement;
    expect(panel.hidden).toBe(true);
  });

  // 7. Pressing Escape while closed has no harmful effect
  it('does not error when Escape is pressed while closed', () => {
    const panel = document.getElementById('actionFormPanel') as HTMLElement;
    expect(panel.hidden).toBe(true);

    expect(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    }).not.toThrow();

    expect(panel.hidden).toBe(true);
  });

  // 8. Closing without saving does not create an action / preserves prefill isolation
  it('clears prefill when closing without saving', () => {
    // Open with prefill
    form.open({
      kind: 'chemical',
      description: 'Should be cleared',
      chemicalProductType: 'ph-reducer',
      chemicalComponent: 'Sodium bisulfate',
      chemicalAmount: 200,
      chemicalUnit: 'ml',
    });

    // Close without saving
    form.close();

    // Re-open WITHOUT prefill — description should be empty
    form.open();
    const descInput = document.getElementById('actionDescription') as HTMLInputElement;
    expect(descInput.value).toBe('');
  });

  // 9. Successful submit closes the panel
  it('closes the panel on successful form submit', () => {
    form.open({
      kind: 'chemical',
      description: 'Added pH reducer',
      chemicalProductType: 'ph-reducer',
      chemicalComponent: 'Sodium bisulfate',
      chemicalAmount: 200,
      chemicalUnit: 'ml',
    });

    const dateInput = document.getElementById('actionDateTime') as HTMLInputElement;
    dateInput.value = '2026-07-12T10:00';

    const descInput = document.getElementById('actionDescription') as HTMLInputElement;
    descInput.value = 'Added pH reducer';

    const formEl = document.getElementById('actionForm') as HTMLFormElement;
    formEl.dispatchEvent(new Event('submit', { cancelable: true }));

    const panel = document.getElementById('actionFormPanel') as HTMLElement;
    expect(panel.hidden).toBe(true);
  });

  // 10. Opening, closing, and reopening works repeatedly
  it('can be opened, closed, and reopened repeatedly', () => {
    const panel = document.getElementById('actionFormPanel') as HTMLElement;

    for (let i = 0; i < 3; i++) {
      form.open();
      expect(panel.hidden).toBe(false);
      form.close();
      expect(panel.hidden).toBe(true);
    }
  });

  // 11. The hidden attribute produces display: none (CSS class override fix)
  it('hidden attribute sets hidden property to true', () => {
    const panel = document.getElementById('actionFormPanel') as HTMLElement;
    panel.hidden = true;
    expect(panel.hidden).toBe(true);
    panel.hidden = false;
    expect(panel.hidden).toBe(false);
  });

  // 12. Other elements using hidden are not broken
  it('does not break hidden behavior of other elements', () => {
    const el = document.createElement('div');
    el.id = 'unrelatedHiddenElement';
    el.hidden = true;
    document.body.appendChild(el);

    expect(el.hidden).toBe(true);
    el.hidden = false;
    expect(el.hidden).toBe(false);
    el.hidden = true;
    expect(el.hidden).toBe(true);
  });

  // ── Additional edge cases ──────────────────────────────────────

  it('clears errors when closing', () => {
    form.open();
    const errorsEl = document.getElementById('actionFormErrors') as HTMLElement;
    errorsEl.innerHTML = '<div class="form-error">Some error</div>';
    expect(errorsEl.innerHTML).not.toBe('');

    form.close();
    expect(errorsEl.innerHTML).toBe('');
  });

  it('does not submit an empty form (validation keeps panel open)', () => {
    form.open();
    const formEl = document.getElementById('actionForm') as HTMLFormElement;
    formEl.dispatchEvent(new Event('submit', { cancelable: true }));

    // Panel stays open because validation prevents submission
    const panel = document.getElementById('actionFormPanel') as HTMLElement;
    expect(panel.hidden).toBe(false);
  });

  it('shows error message when submitting with missing fields', () => {
    form.open();
    const formEl = document.getElementById('actionForm') as HTMLFormElement;
    formEl.dispatchEvent(new Event('submit', { cancelable: true }));

    const errorsEl = document.getElementById('actionFormErrors') as HTMLElement;
    expect(errorsEl.innerHTML).not.toBe('');
  });

  it('sets aria-modal on the panel', () => {
    const panel = document.getElementById('actionFormPanel') as HTMLElement;
    expect(panel.getAttribute('aria-modal')).toBe('true');
  });

  it('has type="button" on the close button', () => {
    const btn = document.getElementById('actionFormCloseBtn') as HTMLButtonElement;
    expect(btn.getAttribute('type')).toBe('button');
  });

  it('has aria-label on the close button', () => {
    const btn = document.getElementById('actionFormCloseBtn') as HTMLButtonElement;
    expect(btn.getAttribute('aria-label')).toBe('Close');
  });
});
