import type {
  MaintenanceAction,
  MaintenanceActionKind,
  ChemicalProductType,
  ChemicalProductCategory,
  ChemicalProductSnapshot,
  ChemicalProductReference,
  ProductUnit,
  ApplicationTarget,
} from '../domain/actions';
import { buildPerformedComparison, determineEvaluationEligibility, generateActionId } from '../domain/actions';
import { CATALOG, getProductById } from '../domain/chemicalCatalog';
import { addAction, addUserChemicalProduct, loadUserChemicalProducts } from '../domain/storage';
import { loadMeasurements } from '../domain/storage';
import type { RecommendationSnapshot } from '../domain/recommendation/recommendationSnapshot';
import {
  APPLICATION_VERSION,
  CHEMICAL_CATALOG_VERSION,
  OUTCOME_EVALUATOR_VERSION,
  RECOMMENDATION_ENGINE_VERSION,
} from '../domain/recommendation/versions';
import { t } from '../i18n/index';
import { renderAlert } from './alert';

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

function getBool(id: string): boolean {
  return (document.getElementById(id) as HTMLInputElement | null)?.checked ?? false;
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
  recommendedAmount?: number;
  recommendedUnit?: string;
  recommendedRuntimeHours?: number;
  recommendedOutputPercent?: number;
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
    'chemical-cover': 'actionChemicalFields',
    algaecide: 'actionChemicalFields',
    clarifier: 'actionChemicalFields',
    flocculant: 'actionChemicalFields',
    stabilizer: 'actionChemicalFields',
    'unknown-product': 'actionChemicalFields',
    chlorinator: 'actionChlorinatorFields',
    filtration: 'actionFiltrationFields',
    'filter-backwash': 'actionFiltrationFields',
    'water-replacement': 'actionWaterFields',
    'water-top-up': 'actionWaterFields',
    'partial-drain': 'actionWaterFields',
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
    document.getElementById('actionProductSource')?.addEventListener('change', () => this.toggleProductFields());
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

  hasUnsavedChanges(): boolean {
    if (this.panel.hidden) return false;
    return Array.from(this.form.elements).some((element) => {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) {
        return false;
      }
      if (element === this.dateTimeInput) return false;
      if (element.type === 'checkbox') return (element as HTMLInputElement).checked;
      return element.value.trim().length > 0;
    });
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
    this.populateProductDropdowns();

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
    this.toggleProductFields();
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

  private toggleProductFields(): void {
    const source = getStr('actionProductSource') || 'system-catalog';
    document.getElementById('actionSystemProductField')?.toggleAttribute('hidden', source !== 'system-catalog');
    document.getElementById('actionUserProductField')?.toggleAttribute('hidden', source !== 'user-catalog');
    document.getElementById('actionCustomProductFields')?.toggleAttribute('hidden', source !== 'one-off' && source !== 'user-catalog');
    document.getElementById('actionUnknownProductHint')?.toggleAttribute('hidden', source !== 'unknown');
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

  private populateProductDropdowns(): void {
    const systemSelect = document.getElementById('actionSystemProduct') as HTMLSelectElement | null;
    if (systemSelect) {
      systemSelect.innerHTML = '';
      for (const product of CATALOG) {
        const opt = document.createElement('option');
        opt.value = product.id;
        opt.textContent = product.genericName;
        systemSelect.appendChild(opt);
      }
    }

    const userSelect = document.getElementById('actionUserProduct') as HTMLSelectElement | null;
    if (userSelect) {
      userSelect.innerHTML = '';
      for (const product of loadUserChemicalProducts()) {
        const opt = document.createElement('option');
        opt.value = product.id;
        opt.textContent = product.snapshot.brand
          ? `${product.snapshot.brand} ${product.snapshot.name}`
          : product.snapshot.name;
        userSelect.appendChild(opt);
      }
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
    const reason = getStr('actionReason').trim() || undefined;
    const performedBy = getStr('actionPerformedBy').trim() || undefined;

    let chemical: MaintenanceAction['chemical'] | undefined;
    let chlorinator: MaintenanceAction['chlorinator'] | undefined;
    let filtration: MaintenanceAction['filtration'] | undefined;
    let waterReplacement: MaintenanceAction['waterReplacement'] | undefined;

    if (categoryForKind(kind) === 'chemical') {
      const productType = getStr('actionChemicalProduct') as ChemicalProductType;
      const mainComponent = getStr('actionChemicalComponent');
      const amount = getNum('actionChemicalAmount');
      const unit = getStr('actionChemicalUnit') as ProductUnit;
      const concentrationPercent = getNum('actionChemicalConcentration');
      const product = this.buildProductReference(productType, mainComponent, concentrationPercent);
      const applicationTarget = (getStr('actionApplicationTarget') as ApplicationTarget) || product?.snapshot.applicationTarget;
      chemical = {
        productType: productType || undefined,
        mainComponent: mainComponent || product?.snapshot.activeIngredients?.[0]?.name,
        amount,
        unit: unit || undefined,
        concentrationPercent,
        product,
        applicationTarget,
      };
    } else if (kind === 'chlorinator') {
      const prevOutput = getNum('actionChlorinatorPrevOutput');
      const newOutput = getNum('actionChlorinatorNewOutput');
      const addHours = getNum('actionChlorinatorAddHours');
      const totalHours = getNum('actionChlorinatorTotalHours');
      if (newOutput !== undefined || addHours !== undefined || totalHours !== undefined) {
        chlorinator = { previousOutputPercent: prevOutput, newOutputPercent: newOutput, additionalHours: addHours, totalHours };
      }
    } else if (kind === 'filtration' || kind === 'filter-backwash') {
      const prevHours = getNum('actionFiltrationPrevHours');
      const newHours = getNum('actionFiltrationNewHours');
      if (newHours !== undefined) {
        filtration = { previousHours: prevHours, newHours };
      }
    } else if (kind === 'water-replacement' || kind === 'water-top-up' || kind === 'partial-drain') {
      const liters = getNum('actionWaterLiters');
      const percent = getNum('actionWaterPercent');
      waterReplacement = { estimatedLiters: liters, estimatedPercent: percent };
    }

    const recommended = {
      amount: this.currentPrefill?.recommendedAmount ?? this.currentPrefill?.chemicalAmount,
      unit: this.currentPrefill?.recommendedUnit ?? this.currentPrefill?.chemicalUnit,
      runtimeHours: this.currentPrefill?.recommendedRuntimeHours
        ?? this.currentPrefill?.chlorinatorAddHours
        ?? this.currentPrefill?.filtrationNewHours,
      outputPercent: this.currentPrefill?.recommendedOutputPercent ?? this.currentPrefill?.chlorinatorNewOutput,
    };
    const performed = {
      amount: chemical?.amount,
      unit: chemical?.unit,
      runtimeHours: chlorinator?.additionalHours ?? filtration?.newHours,
      outputPercent: chlorinator?.newOutputPercent,
    };
    const hasRecommendation = Boolean(this.currentPrefill?.recommendationId);

    const action: MaintenanceAction = {
      id: generateActionId(),
      schemaVersion: 2,
      performedAt,
      kind,
      actionType: kind,
      category: categoryForKind(kind),
      description,
      notes,
      reason,
      performedBy,
      relatedMeasurementId,
      relatedRecommendationId: this.currentPrefill?.recommendationId,
      recommendationId: this.currentPrefill?.recommendationId,
      recommendationSnapshot: this.currentPrefill?.recommendationSnapshot,
      origin: hasRecommendation ? 'recommendation' : 'manual',
      performedValuesProvenance: 'user-entered',
      performedComparison: buildPerformedComparison({
        recommendationId: this.currentPrefill?.recommendationId,
        recommended: hasRecommendation ? recommended : undefined,
        performed,
      }),
      chemical,
      chlorinator,
      filtration,
      waterReplacement,
      isAtypical: getBool('actionIsAtypical'),
      expectedEffect: getStr('actionExpectedEffect').trim() || undefined,
      exclusionFlags: {
        atypical: getBool('actionIsAtypical'),
        incorrectlyRecorded: false,
        excludedFromLearning: getBool('actionExcludeLearning'),
      },
      applicationVersion: APPLICATION_VERSION,
      recommendationEngineVersion: this.currentPrefill?.recommendationSnapshot?.recommendationEngineVersion ?? RECOMMENDATION_ENGINE_VERSION,
      outcomeEvaluatorVersion: OUTCOME_EVALUATOR_VERSION,
      chemicalCatalogVersion: this.currentPrefill?.recommendationSnapshot?.chemicalCatalogVersion ?? CHEMICAL_CATALOG_VERSION,
    };
    action.evaluationEligibility = determineEvaluationEligibility(action);

    addAction(action);
    this.close();
    const followUpInfo = this.currentPrefill?.recommendationId || this.currentPrefill?.retestAfterHours
      ? { recommendationId: this.currentPrefill?.recommendationId, retestAfterHours: this.currentPrefill?.retestAfterHours }
      : undefined;
    this.onSaveCb?.(action, followUpInfo);
    this.currentPrefill = null;
  }

  private showError(msg: string): void {
    this.errorsEl.innerHTML = renderAlert({
      severity: 'danger',
      description: msg,
      className: 'form-error',
      role: 'alert',
    });
  }

  private clearErrors(): void {
    this.errorsEl.innerHTML = '';
  }

  private buildProductReference(
    legacyProductType: ChemicalProductType | '',
    legacyComponent: string,
    concentrationPercent: number | undefined,
  ): ChemicalProductReference | undefined {
    const source = getStr('actionProductSource') || 'system-catalog';
    if (source === 'unknown') {
      return {
        source: 'unknown',
        snapshot: {
          capturedAt: new Date().toISOString(),
          name: getStr('actionCustomProductName').trim() || 'Producto desconocido',
          category: 'unknown',
          physicalForm: 'unknown',
          applicationTarget: (getStr('actionApplicationTarget') as ApplicationTarget) || 'other',
          functions: ['unknown'],
          evaluationEligibility: 'unknown',
          notes: getStr('actionCustomProductNotes').trim() || undefined,
        },
      };
    }

    if (source === 'user-catalog') {
      const selectedId = getStr('actionUserProduct');
      const selected = loadUserChemicalProducts().find((p) => p.id === selectedId);
      if (selected && !getStr('actionCustomProductName').trim()) {
        return {
          source: 'user-catalog',
          productId: selected.id,
          snapshot: { ...selected.snapshot },
        };
      }
    }

    if (source === 'system-catalog') {
      const systemId = getStr('actionSystemProduct');
      const product = getProductById(systemId);
      if (product) {
        return {
          source: 'system-catalog',
          productId: product.id,
          snapshot: {
            productId: product.id,
            capturedAt: new Date().toISOString(),
            name: product.genericName,
            brand: product.manufacturer,
            manufacturer: product.manufacturer,
            sku: product.sku,
            barcode: product.barcode,
            category: categoryFromSystemProduct(product.id, legacyProductType),
            secondaryCategories: product.secondaryCategories,
            functions: product.functions,
            activeIngredients: product.activeIngredients.map((ingredient) => ({ ...ingredient })),
            physicalForm: product.physicalForm,
            applicationTarget: product.applicationTarget,
            stabilizedChlorine: product.stabilizedChlorine,
            availableChlorinePercent: product.availableChlorinePercent,
            concentrationPercent: product.concentration.value,
            densityKgPerLiter: product.densityKgPerLiter,
            raises: product.raises,
            lowers: product.lowers,
            mayAffect: product.mayAffect,
            compatiblePoolTypes: product.compatiblePoolTypes,
            incompatibleSystems: product.incompatibleSystems,
            defaultUnit: product.defaultUnit,
            allowedUnits: product.allowedUnits,
            safetyInstructions: product.safetyNotes,
            applicationInstructions: product.applicationInstructions,
            evaluationProfileId: product.evaluationProfileId,
            evaluationEligibility: product.evaluationEligibility,
            dosageInstructions: product.recommendedDoses.join(' '),
            notes: product.limitations.join(' '),
            catalogVersion: product.catalogVersion,
          },
        };
      }
    }

    const snapshot: ChemicalProductSnapshot = {
      capturedAt: new Date().toISOString(),
      name: getStr('actionCustomProductName').trim() || legacyComponent || 'Producto puntual',
      brand: getStr('actionCustomProductBrand').trim() || undefined,
      category: (getStr('actionCustomProductCategory') as ChemicalProductCategory) || categoryFromSystemProduct('', legacyProductType),
      activeIngredients: legacyComponent
        ? [{ name: legacyComponent, concentrationPercent, userProvided: true }]
        : undefined,
      physicalForm: (getStr('actionCustomProductForm') as ChemicalProductSnapshot['physicalForm']) || undefined,
      applicationTarget: (getStr('actionApplicationTarget') as ApplicationTarget) || 'pool-water',
      dosageInstructions: getStr('actionCustomProductDosage').trim() || undefined,
      notes: getStr('actionCustomProductNotes').trim() || undefined,
    };

    if (getBool('actionSaveProduct')) {
      const saved = addUserChemicalProduct(snapshot);
      return {
        source: 'user-catalog',
        productId: saved.id,
        snapshot: { ...saved.snapshot },
      };
    }

    return {
      source: 'one-off',
      snapshot,
    };
  }
}

function categoryForKind(kind: MaintenanceActionKind): string {
  switch (kind) {
    case 'chemical':
    case 'chemical-cover':
    case 'algaecide':
    case 'clarifier':
    case 'flocculant':
    case 'stabilizer':
    case 'unknown-product':
      return 'chemical';
    case 'chlorinator':
    case 'equipment-maintenance':
      return 'equipment';
    case 'filtration':
    case 'filter-backwash':
      return 'filtration';
    case 'water-replacement':
    case 'water-top-up':
    case 'partial-drain':
      return 'water';
    case 'cleaning':
      return 'cleaning';
    case 'physical-cover':
      return 'cover';
    case 'manual-test':
      return 'measurement';
    case 'inspection':
      return 'inspection';
    default:
      return 'custom';
  }
}

function categoryFromSystemProduct(productId: string, fallback: string): ChemicalProductCategory {
  const catalogProduct = productId ? getProductById(productId) : undefined;
  if (catalogProduct) return catalogProduct.primaryCategory;
  if (productId.includes('ph-reducer') || fallback === 'ph-reducer') return 'ph-reducer';
  if (productId.includes('ph-increaser') || fallback === 'ph-increaser') return 'ph-increaser';
  if (productId.includes('chlorine-granules') || fallback === 'chlorine-granules') return 'fast-chlorine';
  if (productId.includes('stabilizer') || fallback === 'chlorine-stabilizer') return 'stabilizer';
  if (productId.includes('salt') || fallback === 'pool-salt') return 'salt';
  return 'other';
}
