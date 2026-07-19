import type {
  MaintenanceAction,
  MaintenanceActionKind,
  ChemicalProductType,
} from '../domain/actions';
import { generateActionId } from '../domain/actions';
import { addAction } from '../domain/storage';
import { loadMeasurements } from '../domain/storage';
import type { RecommendationSnapshot } from '../domain/recommendation/recommendationSnapshot';
import {
  APPLICATION_VERSION,
  CHEMICAL_CATALOG_VERSION,
  OUTCOME_EVALUATOR_VERSION,
  RECOMMENDATION_ENGINE_VERSION,
} from '../domain/recommendation/versions';
import { t } from '../i18n/index';

function localDatetimeToISO(localValue: string): string {
  return new Date(localValue).toISOString();
}

function dateToLocalDatetime(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
}

function getNum(id: string): number | undefined {
  const el = document.getElementById(id) as HTMLInputElement;
  if (!el || el.value === '') return undefined;
  return parseFloat(el.value);
}

function getStr(id: string): string {
  return (document.getElementById(id) as HTMLInputElement | HTMLSelectElement)?.value ?? '';
}

function setVal(id: string, val: string | number | undefined): void {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
  if (el && val !== undefined && val !== null) {
    el.value = String(val);
  }
}

export interface ActionFormPrefill {
  kind: MaintenanceActionKind;
  description: string;
  recommendationId?: string;
  recommendationSnapshot?: RecommendationSnapshot;
  retestAfterHours?: number;
  chemicalProductType?: ChemicalProductType;
  chemicalComponent?: string;
  chemicalAmount?: number;
  chemicalUnit?: 'ml' | 'l' | 'g' | 'kg';
  chlorinatorNewOutput?: number;
  chlorinatorPrevOutput?: number;
  chlorinatorAddHours?: number;
  chlorinatorTotalHours?: number;
  filtrationNewHours?: number;
  filtrationPrevHours?: number;
  relatedMeasurementId?: string;
}

function requiredElement<T extends HTMLElement = HTMLElement>(id: string, kind: string): T {
  const el = document.getElementById(id) as T | null;
  if (!el) {
    throw new Error(`ActionForm: required element #${id} not found — cannot initialise ${kind}.`);
  }
  return el;
}

export class ActionForm {
  private panel: HTMLElement;
  private overlay: HTMLElement;
  private closeBtn: HTMLButtonElement;
  private form: HTMLFormElement;
  private kindSelect: HTMLSelectElement;
  private dateTimeInput: HTMLInputElement;
  private errorsEl: HTMLElement;
  private relatedSelect: HTMLSelectElement;
  private descriptionInput: HTMLInputElement;
  private drawer: HTMLElement;
  private currentPrefill: ActionFormPrefill | null = null;
  private previousFocused: HTMLElement | null = null;
  private onSaveCb: ((action: MaintenanceAction, followUpInfo?: { recommendationId?: string; retestAfterHours?: number }) => void) | null = null;

  private readonly kindFieldMap: Record<string, string> = {
    chemical: 'actionChemicalFields',
    chlorinator: 'actionChlorinatorFields',
    filtration: 'actionFiltrationFields',
    'water-replacement': 'actionWaterFields',
  };

  constructor() {
    this.panel = requiredElement('actionFormPanel', 'panel');
    this.overlay = requiredElement('actionFormOverlay', 'overlay');
    this.closeBtn = requiredElement<HTMLButtonElement>('actionFormCloseBtn', 'close button');
    this.form = requiredElement<HTMLFormElement>('actionForm', 'form');
    this.kindSelect = requiredElement<HTMLSelectElement>('actionKind', 'kind select');
    this.dateTimeInput = requiredElement<HTMLInputElement>('actionDateTime', 'date-time input');
    this.errorsEl = requiredElement('actionFormErrors', 'errors element');
    this.relatedSelect = requiredElement<HTMLSelectElement>('actionRelatedMeasurement', 'related measurement select');
    this.descriptionInput = requiredElement<HTMLInputElement>('actionDescription', 'description input');
    this.drawer = requiredElement('actionFormDrawer', 'drawer');

    this.overlay.addEventListener('click', () => this.close());
    this.closeBtn.addEventListener('click', () => this.close());
    this.kindSelect.addEventListener('change', () => this.toggleKindFields());
    this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    this.drawer.addEventListener('click', (e) => e.stopPropagation());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.panel.hidden) {
        e.preventDefault();
        this.close();
      }
    });
  }

  onSave(cb: (action: MaintenanceAction, followUpInfo?: { recommendationId?: string; retestAfterHours?: number }) => void): void {
    this.onSaveCb = cb;
  }

  open(prefill?: ActionFormPrefill): void {
    this.previousFocused = document.activeElement as HTMLElement | null;
    this.currentPrefill = prefill ?? null;

    // Reset form
    this.form.reset();
    this.clearErrors();

    // Set default date-time
    const now = dateToLocalDatetime(new Date());
    this.dateTimeInput.value = now;

    // Populate measurement dropdown
    this.populateMeasurementDropdown();

    // Apply prefill if provided
    if (prefill) {
      setVal('actionKind', prefill.kind);
      this.descriptionInput.value = prefill.description;

      if (prefill.relatedMeasurementId) {
        setVal('actionRelatedMeasurement', prefill.relatedMeasurementId);
      }

      if (prefill.kind === 'chemical') {
        if (prefill.chemicalProductType) setVal('actionChemicalProduct', prefill.chemicalProductType);
        if (prefill.chemicalComponent) setVal('actionChemicalComponent', prefill.chemicalComponent);
        if (prefill.chemicalAmount !== undefined) setVal('actionChemicalAmount', prefill.chemicalAmount);
        if (prefill.chemicalUnit) setVal('actionChemicalUnit', prefill.chemicalUnit);
      } else if (prefill.kind === 'chlorinator') {
        if (prefill.chlorinatorPrevOutput !== undefined) setVal('actionChlorinatorPrevOutput', prefill.chlorinatorPrevOutput);
        if (prefill.chlorinatorNewOutput !== undefined) setVal('actionChlorinatorNewOutput', prefill.chlorinatorNewOutput);
        if (prefill.chlorinatorAddHours !== undefined) setVal('actionChlorinatorAddHours', prefill.chlorinatorAddHours);
        if (prefill.chlorinatorTotalHours !== undefined) setVal('actionChlorinatorTotalHours', prefill.chlorinatorTotalHours);
      } else if (prefill.kind === 'filtration') {
        if (prefill.filtrationPrevHours !== undefined) setVal('actionFiltrationPrevHours', prefill.filtrationPrevHours);
        if (prefill.filtrationNewHours !== undefined) setVal('actionFiltrationNewHours', prefill.filtrationNewHours);
      }
    }

    this.toggleKindFields();
    this.panel.hidden = false;

    // Focus the close button so the panel is keyboard-accessible
    this.closeBtn.focus();
  }

  close(): void {
    this.panel.hidden = true;
    this.clearErrors();
    this.currentPrefill = null;

    // Restore focus to the element that opened the panel
    if (this.previousFocused && typeof this.previousFocused.focus === 'function') {
      this.previousFocused.focus();
    }
    this.previousFocused = null;
  }

  private toggleKindFields(): void {
    // Hide all kind-specific fields
    for (const id of Object.values(this.kindFieldMap)) {
      const el = document.getElementById(id);
      if (el) el.hidden = true;
    }

    // Show the relevant one
    const kind = this.kindSelect.value;
    const fieldsId = this.kindFieldMap[kind];
    if (fieldsId) {
      const el = document.getElementById(fieldsId);
      if (el) el.hidden = false;
    }
  }

  private populateMeasurementDropdown(): void {
    const measurements = loadMeasurements();
    // Keep the first option ("— None —")
    while (this.relatedSelect.options.length > 1) {
      this.relatedSelect.remove(1);
    }

    // Show most recent first
    const sorted = [...measurements].sort((a, b) =>
      b.measuredAt.localeCompare(a.measuredAt),
    );

    for (const m of sorted) {
      const opt = document.createElement('option');
      opt.value = m.id;
      const date = new Date(m.measuredAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      opt.textContent = `${date} — pH ${m.ph.toFixed(1)}, FAC ${m.fac.toFixed(1)}`;
      this.relatedSelect.appendChild(opt);
    }
  }

  private handleSubmit(e: Event): void {
    e.preventDefault();
    this.clearErrors();

    const dateTimeLocal = this.dateTimeInput.value;
    if (!dateTimeLocal) {
      this.showError(t('actionForm.errors.dateTime'));
      return;
    }
    const performedAt = localDatetimeToISO(dateTimeLocal);

    const description = this.descriptionInput.value.trim();
    if (!description) {
      this.showError(t('actionForm.errors.description'));
      return;
    }

    const kind = this.kindSelect.value as MaintenanceActionKind;
    const notes = (document.getElementById('actionNotes') as HTMLTextAreaElement).value.trim() || undefined;
    const relatedMeasurementId = this.relatedSelect.value || undefined;

    let chemical: MaintenanceAction['chemical'] | undefined;
    let chlorinator: MaintenanceAction['chlorinator'] | undefined;
    let filtration: MaintenanceAction['filtration'] | undefined;
    let waterReplacement: MaintenanceAction['waterReplacement'] | undefined;

    if (kind === 'chemical') {
      const productType = getStr('actionChemicalProduct') as ChemicalProductType;
      const mainComponent = getStr('actionChemicalComponent');
      const amount = getNum('actionChemicalAmount');
      const unit = getStr('actionChemicalUnit') as 'ml' | 'l' | 'g' | 'kg';
      if (productType && mainComponent && amount !== undefined && unit) {
        chemical = { productType, mainComponent, amount, unit };
      }
    } else if (kind === 'chlorinator') {
      const prevOutput = getNum('actionChlorinatorPrevOutput');
      const newOutput = getNum('actionChlorinatorNewOutput');
      const addHours = getNum('actionChlorinatorAddHours');
      const totalHours = getNum('actionChlorinatorTotalHours');
      if (newOutput !== undefined) {
        chlorinator = { previousOutputPercent: prevOutput, newOutputPercent: newOutput, additionalHours: addHours, totalHours };
      }
    } else if (kind === 'filtration') {
      const prevHours = getNum('actionFiltrationPrevHours');
      const newHours = getNum('actionFiltrationNewHours');
      if (newHours !== undefined) {
        filtration = { previousHours: prevHours, newHours };
      }
    } else if (kind === 'water-replacement') {
      const liters = getNum('actionWaterLiters');
      const percent = getNum('actionWaterPercent');
      waterReplacement = { estimatedLiters: liters, estimatedPercent: percent };
    }

    const action: MaintenanceAction = {
      id: generateActionId(),
      performedAt,
      kind,
      description,
      notes,
      relatedMeasurementId,
      relatedRecommendationId: this.currentPrefill?.recommendationId,
      recommendationSnapshot: this.currentPrefill?.recommendationSnapshot,
      chemical,
      chlorinator,
      filtration,
      waterReplacement,
      applicationVersion: APPLICATION_VERSION,
      recommendationEngineVersion: this.currentPrefill?.recommendationSnapshot?.recommendationEngineVersion ?? RECOMMENDATION_ENGINE_VERSION,
      outcomeEvaluatorVersion: OUTCOME_EVALUATOR_VERSION,
      chemicalCatalogVersion: this.currentPrefill?.recommendationSnapshot?.chemicalCatalogVersion ?? CHEMICAL_CATALOG_VERSION,
    };

    addAction(action);
    this.close();
    const followUpInfo = this.currentPrefill?.recommendationId || this.currentPrefill?.retestAfterHours
      ? { recommendationId: this.currentPrefill?.recommendationId, retestAfterHours: this.currentPrefill?.retestAfterHours }
      : undefined;
    this.onSaveCb?.(action, followUpInfo);
    this.currentPrefill = null;
  }

  private showError(msg: string): void {
    this.errorsEl.innerHTML = `<div class="form-error">${escapeHtml(msg)}</div>`;
  }

  private clearErrors(): void {
    this.errorsEl.innerHTML = '';
  }
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
