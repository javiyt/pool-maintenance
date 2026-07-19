import type {
  ActiveIngredientSnapshot,
  ApplicationTarget,
  ChemicalParameterEffect,
  ChemicalProductCategory,
  ProductFunction,
  ProductPhysicalForm,
  ProductUnit,
} from './actions';
import type { PoolType } from './settings';

// ── Types ─────────────────────────────────────────────────────────

export type DosageType =
  | 'phDownLiquid'
  | 'phUpLiquid'
  | 'chlorineGranules'
  | 'cyanuricAcid'
  | 'alkalinityReducer'
  | 'poolSalt';

export interface DosageRule {
  type: DosageType;
  /** Base amount of product */
  amount: number;
  /** Unit for the base amount */
  amountUnit: 'ml' | 'l' | 'g' | 'kg';
  /** Reference pool volume in m³ that the base amount applies to */
  perVolumeM3: number;
  /** How much the active parameter changes per dose (optional) */
  changesValueBy?: number;
  /** Unit for the change value */
  changesUnit?: 'pH' | 'ppm';
}

export interface ManufacturerDosage {
  label: string;
  source?: 'manufacturer-label' | 'user-entered' | 'imported';
  unitEquivalences?: Array<{
    commercialUnit: ProductUnit;
    amount: number;
    physicalUnit: ProductUnit;
  }>;
}

export type ProductEvaluationEligibility =
  | 'evaluable'
  | 'conditionally-evaluable'
  | 'not-evaluable'
  | 'unknown';

export interface ChemicalProduct {
  id: string;
  source: 'system-catalog';
  code: string;
  name: string;
  genericName: string;
  type?: DosageType;
  mainComponent: string;
  purpose: string;
  primaryCategory: ChemicalProductCategory;
  secondaryCategories: ChemicalProductCategory[];
  functions: ProductFunction[];
  activeIngredients: ActiveIngredientSnapshot[];
  physicalForm: ProductPhysicalForm;
  applicationTarget: ApplicationTarget;
  concentration: {
    label: string;
    value?: number;
    unit?: '%' | 'g/l' | 'ppm';
  };
  stabilizedChlorine?: boolean;
  availableChlorinePercent?: number;
  concentrationPercent?: number;
  densityKgPerLiter?: number;
  raises?: ChemicalParameterEffect[];
  lowers?: ChemicalParameterEffect[];
  mayAffect?: ChemicalParameterEffect[];
  compatiblePoolTypes?: PoolType[];
  incompatibleSystems?: string[];
  defaultUnit?: ProductUnit;
  allowedUnits: ProductUnit[];
  manufacturerDosage?: ManufacturerDosage;
  manufacturer?: string;
  sku?: string;
  barcode?: string;
  appliesTo: 'all' | PoolType[];
  dosageRule?: DosageRule;
  recommendedDoses: string[];
  limitations: string[];
  safetyNotes: string[];
  applicationInstructions: string[];
  evaluationProfileId?: string;
  evaluationEligibility: ProductEvaluationEligibility;
  notes?: string;
  catalogVersion: string;
  createdAt: string;
  updatedAt: string;
}

type ProductSeed = {
  id: string;
  code: string;
  name: string;
  category: ChemicalProductCategory;
  secondaryCategories?: ChemicalProductCategory[];
  functions: ProductFunction[];
  form?: ProductPhysicalForm;
  target?: ApplicationTarget;
  component?: string;
  ingredients?: ActiveIngredientSnapshot[];
  purpose?: string;
  concentrationLabel?: string;
  concentrationPercent?: number;
  availableChlorinePercent?: number;
  stabilizedChlorine?: boolean;
  type?: DosageType;
  dosageRule?: DosageRule;
  raises?: ChemicalParameterEffect[];
  lowers?: ChemicalParameterEffect[];
  mayAffect?: ChemicalParameterEffect[];
  incompatibleSystems?: string[];
  appliesTo?: 'all' | PoolType[];
  defaultUnit?: ProductUnit;
  allowedUnits?: ProductUnit[];
  recommendedDoses?: string[];
  limitations?: string[];
  safetyNotes?: string[];
  applicationInstructions?: string[];
  evaluationEligibility?: ProductEvaluationEligibility;
  notes?: string;
};

// ── Catalog ───────────────────────────────────────────────────────

export const CHEMICAL_CATALOG_VERSION = '3.0.0';

const SYSTEM_CATALOG_TIMESTAMP = '2026-07-19T00:00:00.000Z';

const DEFAULT_SAFETY_NOTES = [
  'Seguir siempre la etiqueta y la ficha de seguridad del producto concreto.',
  'No mezclar con otros productos químicos.',
  'Mantener fuera del alcance de niños y mascotas.',
];

const DEFAULT_LIMITATIONS = [
  'No asumir composición, concentración ni efectos si la etiqueta no los documenta.',
  'No calcular dosis automática sin concentración, volumen e instrucciones suficientes.',
];

function unitsForForm(form: ProductPhysicalForm): ProductUnit[] {
  switch (form) {
    case 'liquid':
      return ['ml', 'cl', 'l', 'tapon', 'dosis'];
    case 'granules':
    case 'powder':
    case 'solid':
      return ['mg', 'g', 'kg', 'bolsa', 'sobre', 'dosis'];
    case 'tablets':
      return ['tablet', 'tablets', 'pastilla', 'g', 'kg', 'dosis'];
    case 'blocks':
      return ['block', 'unidad', 'g', 'kg'];
    case 'cartridge':
      return ['cartucho', 'unidad'];
    default:
      return ['ml', 'l', 'g', 'kg', 'dosis', 'unidad', 'other'];
  }
}

function makeProduct(seed: ProductSeed): ChemicalProduct {
  const physicalForm = seed.form ?? 'unknown';
  const concentrationValue = seed.concentrationPercent ?? seed.availableChlorinePercent;
  const ingredients = seed.ingredients ?? [{
    name: seed.component ?? 'Composición no especificada',
    concentrationPercent: seed.concentrationPercent,
    availableSubstancePercent: seed.availableChlorinePercent,
    userProvided: false,
  }];
  const mainComponent = seed.component ?? ingredients[0]?.name ?? 'Composición no especificada';

  return {
    id: seed.id,
    source: 'system-catalog',
    code: seed.code,
    name: seed.name,
    genericName: seed.name,
    type: seed.type,
    mainComponent,
    purpose: seed.purpose ?? purposeFor(seed.functions),
    primaryCategory: seed.category,
    secondaryCategories: seed.secondaryCategories ?? [],
    functions: seed.functions,
    activeIngredients: ingredients,
    physicalForm,
    applicationTarget: seed.target ?? 'pool-water',
    concentration: {
      label: seed.concentrationLabel ?? (
        concentrationValue !== undefined
          ? `${concentrationValue}% declarado en catálogo`
          : 'Composición o concentración no especificada'
      ),
      value: concentrationValue,
      unit: concentrationValue !== undefined ? '%' : undefined,
    },
    stabilizedChlorine: seed.stabilizedChlorine,
    availableChlorinePercent: seed.availableChlorinePercent,
    concentrationPercent: seed.concentrationPercent,
    raises: seed.raises,
    lowers: seed.lowers,
    mayAffect: seed.mayAffect,
    incompatibleSystems: seed.incompatibleSystems,
    compatiblePoolTypes: seed.appliesTo === 'all' || !seed.appliesTo ? undefined : seed.appliesTo,
    defaultUnit: seed.defaultUnit ?? unitsForForm(physicalForm)[0],
    allowedUnits: seed.allowedUnits ?? unitsForForm(physicalForm),
    appliesTo: seed.appliesTo ?? 'all',
    dosageRule: seed.dosageRule,
    recommendedDoses: seed.recommendedDoses ?? ['Registrar la cantidad real aplicada y seguir la etiqueta del fabricante.'],
    limitations: seed.limitations ?? DEFAULT_LIMITATIONS,
    safetyNotes: seed.safetyNotes ?? DEFAULT_SAFETY_NOTES,
    applicationInstructions: seed.applicationInstructions ?? ['Registrar método y lugar de aplicación.'],
    evaluationEligibility: seed.evaluationEligibility ?? 'not-evaluable',
    notes: seed.notes,
    catalogVersion: CHEMICAL_CATALOG_VERSION,
    createdAt: SYSTEM_CATALOG_TIMESTAMP,
    updatedAt: SYSTEM_CATALOG_TIMESTAMP,
  };
}

function purposeFor(functions: ProductFunction[]): string {
  if (functions.includes('sanitation')) return 'Desinfectar el agua';
  if (functions.includes('oxidation')) return 'Oxidar contaminantes';
  if (functions.includes('ph-control')) return 'Regular el pH';
  if (functions.includes('alkalinity-control')) return 'Regular la alcalinidad';
  if (functions.includes('hardness-control')) return 'Regular la dureza cálcica o el equilibrio mineral';
  if (functions.includes('stabilization')) return 'Gestionar estabilización del cloro';
  if (functions.includes('salt-increase')) return 'Aumentar salinidad para electrólisis salina';
  if (functions.includes('algae-treatment')) return 'Tratar presencia de algas';
  if (functions.includes('clarification')) return 'Mejorar claridad del agua';
  if (functions.includes('flocculation')) return 'Agrupar partículas para retirada posterior';
  if (functions.includes('metal-control')) return 'Controlar metales disueltos';
  if (functions.includes('evaporation-reduction')) return 'Reducir evaporación';
  if (functions.includes('winterizing')) return 'Preparar o recuperar piscina por temporada';
  if (functions.includes('surface-cleaning')) return 'Limpiar superficies';
  if (functions.includes('filter-cleaning')) return 'Limpiar o mantener el filtro';
  if (functions.includes('equipment-cleaning')) return 'Limpiar o mantener equipos y circuitos';
  if (functions.includes('neutralization')) return 'Neutralizar una sustancia conocida';
  if (functions.includes('measurement-consumable')) return 'Consumible de medición o calibración';
  return 'Registrar producto de piscina sin inferir efectos no documentados';
}

const CORE_PRODUCTS: ProductSeed[] = [
  {
    id: 'ph-reducer-liquid',
    code: 'PH_REDUCER_LIQUID',
    name: 'Reductor de pH líquido',
    category: 'ph-reducer',
    secondaryCategories: ['ph-regulation'],
    functions: ['ph-control'],
    form: 'liquid',
    component: 'Ácido reductor de pH',
    purpose: 'Bajar el pH del agua',
    concentrationLabel: 'Producto líquido genérico según dosificación de catálogo',
    type: 'phDownLiquid',
    lowers: [{ parameter: 'ph', certainty: 'known' }],
    dosageRule: {
      type: 'phDownLiquid',
      amount: 750,
      amountUnit: 'ml',
      perVolumeM3: 50,
      changesValueBy: 0.1,
      changesUnit: 'pH',
    },
    recommendedDoses: [
      '750 ml por 50 m³ para bajar aproximadamente 0.1 unidades de pH.',
      'Aplicar en ciclos de corrección y volver a medir antes de repetir.',
    ],
    limitations: [
      'Registrar sustancia, concentración y densidad si se conocen.',
      'No calcular dosis para ácidos genéricos si faltan datos del fabricante.',
    ],
    safetyNotes: [
      'Manejar con guantes y gafas de protección.',
      'Añadir gradualmente cerca del retorno de agua.',
      'No mezclar con otros productos químicos.',
    ],
    evaluationEligibility: 'evaluable',
  },
  {
    id: 'ph-increaser-liquid',
    code: 'PH_INCREASER',
    name: 'Incrementador de pH líquido',
    category: 'ph-increaser',
    secondaryCategories: ['ph-regulation'],
    functions: ['ph-control'],
    form: 'liquid',
    component: 'Base alcalina incrementadora de pH',
    purpose: 'Subir el pH del agua',
    concentrationLabel: 'Producto líquido genérico según dosificación de catálogo',
    type: 'phUpLiquid',
    raises: [{ parameter: 'ph', certainty: 'known' }],
    dosageRule: {
      type: 'phUpLiquid',
      amount: 1000,
      amountUnit: 'ml',
      perVolumeM3: 50,
      changesValueBy: 0.1,
      changesUnit: 'pH',
    },
    recommendedDoses: [
      '1 l por 50 m³ para subir aproximadamente 0.1 unidades de pH.',
      'Aplicar en ciclos de corrección y volver a medir antes de repetir.',
    ],
    evaluationEligibility: 'evaluable',
  },
  {
    id: 'chlorine-granules',
    code: 'FAST_CHLORINE',
    name: 'Cloro granulado',
    category: 'fast-chlorine',
    secondaryCategories: ['chlorine-disinfection'],
    functions: ['sanitation', 'oxidation'],
    form: 'granules',
    component: 'Cloro de disolución rápida',
    purpose: 'Aumentar el cloro libre disponible',
    concentrationLabel: 'Dicloro granulado genérico 55% de cloro disponible',
    availableChlorinePercent: 55,
    stabilizedChlorine: true,
    type: 'chlorineGranules',
    raises: [{ parameter: 'fac', certainty: 'known' }],
    mayAffect: [{ parameter: 'cya', certainty: 'potential', notes: 'Los cloros estabilizados pueden aportar CYA.' }],
    dosageRule: {
      type: 'chlorineGranules',
      amount: 1.8,
      amountUnit: 'g',
      perVolumeM3: 1,
      changesValueBy: 1,
      changesUnit: 'ppm',
    },
    recommendedDoses: [
      'Calcular por déficit de FAC, volumen y porcentaje de cloro disponible.',
      'No usar una dosis fija de choque sin medir el déficit real.',
    ],
    limitations: [
      'Para piscinas salinas, usar solo como tratamiento de choque correctivo.',
      'Puede aportar ácido cianúrico si el producto es dicloro u otro cloro estabilizado.',
    ],
    safetyNotes: [
      'Manejar con guantes y gafas de protección.',
      'No mezclar con ácidos u otros productos químicos.',
      'Añadir en horas de baja radiación solar.',
      'Esperar al menos 30 minutos antes de bañarse.',
    ],
    evaluationEligibility: 'evaluable',
  },
  {
    id: 'chlorine-stabilizer',
    code: 'CHLORINE_STABILIZER',
    name: 'Estabilizador de cloro',
    category: 'stabilizer',
    secondaryCategories: ['cyanuric-acid'],
    functions: ['stabilization'],
    form: 'granules',
    component: 'Ácido cianúrico',
    purpose: 'Aumentar el estabilizador para proteger el cloro frente al sol',
    concentrationLabel: 'Ácido cianúrico granulado genérico',
    concentrationPercent: 100,
    availableChlorinePercent: 0,
    stabilizedChlorine: true,
    type: 'cyanuricAcid',
    raises: [{ parameter: 'cya', certainty: 'known' }],
    dosageRule: {
      type: 'cyanuricAcid',
      amount: 30,
      amountUnit: 'g',
      perVolumeM3: 1,
      changesValueBy: 30,
      changesUnit: 'ppm',
    },
    recommendedDoses: [
      '30 g/m³ aumentan aproximadamente 30 ppm de ácido cianúrico.',
      'No calcular dosis sin una medición manual actual.',
    ],
    limitations: [
      'El medidor digital no mide ácido cianúrico. No calcular dosis sin una medición manual.',
    ],
    safetyNotes: [
      'Disolver en agua tibia antes de añadir.',
      'Añadir lentamente en el skimmer.',
    ],
    evaluationEligibility: 'not-evaluable',
  },
  {
    id: 'total-alkalinity-reducer',
    code: 'ALKALINITY_REDUCER',
    name: 'Reductor de alcalinidad total',
    category: 'alkalinity',
    secondaryCategories: ['ph-regulation'],
    functions: ['alkalinity-control'],
    form: 'unknown',
    component: 'Ácido reductor de alcalinidad',
    purpose: 'Bajar la alcalinidad total del agua',
    concentrationLabel: 'Producto ácido genérico',
    type: 'alkalinityReducer',
    dosageRule: undefined,
    lowers: [{ parameter: 'alkalinity', certainty: 'manufacturer-claimed' }],
    mayAffect: [{ parameter: 'ph', certainty: 'potential' }],
    recommendedDoses: [
      'Depende de la alcalinidad total medida manualmente y del producto concreto.',
    ],
    limitations: [
      'El medidor digital no mide alcalinidad total. No calcular dosis sin una medición manual.',
      'Diferenciar si la acción buscaba modificar pH o alcalinidad aunque se use el mismo producto.',
    ],
    evaluationEligibility: 'not-evaluable',
  },
  {
    id: 'pool-salt',
    code: 'POOL_SALT',
    name: 'Sal para piscina',
    category: 'salt',
    secondaryCategories: ['salt-system'],
    functions: ['salt-increase'],
    form: 'solid',
    component: 'Cloruro sódico',
    purpose: 'Aumentar la concentración de sal en piscinas salinas',
    concentrationLabel: 'Cloruro sódico para piscina',
    concentrationPercent: 99,
    availableChlorinePercent: 0,
    stabilizedChlorine: false,
    appliesTo: ['saltwater'],
    type: 'poolSalt',
    raises: [{ parameter: 'salt', certainty: 'known' }],
    dosageRule: {
      type: 'poolSalt',
      amount: 1,
      amountUnit: 'kg',
      perVolumeM3: 0,
      changesValueBy: undefined,
      changesUnit: undefined,
    },
    recommendedDoses: [
      'kg = déficit ppm × volumen L / 1.000.000.',
    ],
    limitations: [
      'No usar en piscinas de cloro tradicional.',
      'Estimación basada en ppm y volumen de la piscina.',
    ],
    safetyNotes: [
      'Distribuir uniformemente por la superficie.',
      'Cepillar el fondo si se acumulan cristales.',
    ],
    evaluationEligibility: 'evaluable',
  },
];

const STANDARD_PRODUCTS: ProductSeed[] = [
  // 1. Desinfección con cloro
  { id: 'chlorine-liquid', code: 'CHLORINE_LIQUID', name: 'Cloro líquido', category: 'chlorine-disinfection', secondaryCategories: ['fast-chlorine'], functions: ['sanitation', 'oxidation'], form: 'liquid', component: 'Hipoclorito líquido', raises: [{ parameter: 'fac', certainty: 'manufacturer-claimed' }], evaluationEligibility: 'conditionally-evaluable' },
  { id: 'sodium-hypochlorite', code: 'SODIUM_HYPOCHLORITE', name: 'Hipoclorito sódico', category: 'chlorine-disinfection', secondaryCategories: ['fast-chlorine'], functions: ['sanitation', 'oxidation'], form: 'liquid', component: 'Hipoclorito sódico', raises: [{ parameter: 'fac', certainty: 'known' }], evaluationEligibility: 'conditionally-evaluable' },
  { id: 'calcium-hypochlorite', code: 'CALCIUM_HYPOCHLORITE', name: 'Hipoclorito cálcico', category: 'chlorine-disinfection', functions: ['sanitation', 'oxidation'], form: 'granules', component: 'Hipoclorito cálcico', raises: [{ parameter: 'fac', certainty: 'known' }], mayAffect: [{ parameter: 'calcium-hardness', certainty: 'potential' }], evaluationEligibility: 'conditionally-evaluable' },
  { id: 'dichlor', code: 'DICHLOR', name: 'Dicloro', category: 'chlorine-disinfection', secondaryCategories: ['stabilizer'], functions: ['sanitation', 'oxidation', 'stabilization'], form: 'granules', component: 'Dicloro', stabilizedChlorine: true, mayAffect: [{ parameter: 'cya', certainty: 'potential' }], evaluationEligibility: 'conditionally-evaluable' },
  { id: 'trichlor', code: 'TRICHLOR', name: 'Tricloro', category: 'chlorine-disinfection', secondaryCategories: ['stabilizer', 'slow-chlorine'], functions: ['sanitation', 'oxidation', 'stabilization'], form: 'tablets', component: 'Tricloro', stabilizedChlorine: true, mayAffect: [{ parameter: 'cya', certainty: 'potential' }], evaluationEligibility: 'conditionally-evaluable' },
  { id: 'slow-chlorine', code: 'SLOW_CHLORINE', name: 'Cloro de disolución lenta', category: 'chlorine-disinfection', secondaryCategories: ['slow-chlorine'], functions: ['sanitation'], form: 'tablets', component: 'Cloro de disolución lenta', evaluationEligibility: 'conditionally-evaluable' },
  { id: 'chlorine-tablets', code: 'CHLORINE_TABLETS', name: 'Tabletas de cloro', category: 'chlorine-disinfection', secondaryCategories: ['slow-chlorine'], functions: ['sanitation'], form: 'tablets', component: 'Cloro en tabletas', evaluationEligibility: 'conditionally-evaluable' },
  { id: 'chlorine-shock', code: 'CHLORINE_SHOCK', name: 'Cloro de choque', category: 'shock-chlorine', secondaryCategories: ['chlorine-disinfection'], functions: ['sanitation', 'oxidation'], form: 'granules', component: 'Oxidante clorado de choque', evaluationEligibility: 'conditionally-evaluable' },
  { id: 'chlorinated-oxidizer', code: 'CHLORINATED_OXIDIZER', name: 'Oxidante clorado', category: 'chlorine-disinfection', functions: ['oxidation', 'sanitation'], form: 'granules', component: 'Oxidante clorado', evaluationEligibility: 'conditionally-evaluable' },
  { id: 'multifunction-chlorine', code: 'MULTIFUNCTION_CHLORINE', name: 'Pastillas multifunción con cloro', category: 'multifunction', secondaryCategories: ['chlorine-disinfection'], functions: ['sanitation', 'algae-prevention', 'clarification', 'stabilization'], form: 'tablets', component: 'Componentes múltiples no especificados', evaluationEligibility: 'conditionally-evaluable', notes: 'No inferir composición por reclamos comerciales multifunción.' },

  // 2. Desinfección sin cloro y oxidación
  { id: 'active-oxygen', code: 'ACTIVE_OXYGEN', name: 'Oxígeno activo', category: 'non-chlorine-disinfection', functions: ['oxidation', 'sanitation'], form: 'granules', component: 'Oxígeno activo', incompatibleSystems: ['biguanide unless manufacturer states compatibility'], evaluationEligibility: 'conditionally-evaluable' },
  { id: 'potassium-monopersulfate', code: 'POTASSIUM_MONOPERSULFATE', name: 'Monopersulfato potásico', category: 'non-chlorine-disinfection', functions: ['oxidation'], form: 'powder', component: 'Monopersulfato potásico', evaluationEligibility: 'conditionally-evaluable' },
  { id: 'hydrogen-peroxide', code: 'HYDROGEN_PEROXIDE', name: 'Peróxido de hidrógeno', category: 'non-chlorine-disinfection', functions: ['oxidation', 'sanitation'], form: 'liquid', component: 'Peróxido de hidrógeno', evaluationEligibility: 'conditionally-evaluable' },
  { id: 'non-chlorine-shock', code: 'NON_CHLORINE_SHOCK', name: 'Oxidante sin cloro', category: 'non-chlorine-disinfection', functions: ['oxidation'], form: 'unknown', component: 'Oxidante no clorado', evaluationEligibility: 'conditionally-evaluable' },
  { id: 'bromine', code: 'BROMINE', name: 'Bromo', category: 'non-chlorine-disinfection', functions: ['sanitation'], form: 'unknown', component: 'Bromo', incompatibleSystems: ['chlorine automation unless manufacturer states compatibility'], evaluationEligibility: 'conditionally-evaluable' },
  { id: 'bromine-tablets', code: 'BROMINE_TABLETS', name: 'Tabletas de bromo', category: 'non-chlorine-disinfection', functions: ['sanitation'], form: 'tablets', component: 'Bromo en tabletas', evaluationEligibility: 'conditionally-evaluable' },
  { id: 'bromine-activator', code: 'BROMINE_ACTIVATOR', name: 'Activador de bromo', category: 'non-chlorine-disinfection', functions: ['oxidation'], form: 'unknown', component: 'Activador de bromo', evaluationEligibility: 'not-evaluable' },
  { id: 'biguanide', code: 'BIGUANIDE', name: 'Biguanida', category: 'non-chlorine-disinfection', functions: ['sanitation'], form: 'liquid', component: 'Biguanida', incompatibleSystems: ['chlorine', 'bromine'], evaluationEligibility: 'conditionally-evaluable' },
  { id: 'biguanide-oxidizer', code: 'BIGUANIDE_OXIDIZER', name: 'Oxidante para biguanida', category: 'non-chlorine-disinfection', functions: ['oxidation'], form: 'liquid', component: 'Oxidante compatible con biguanida', incompatibleSystems: ['chlorine unless manufacturer states compatibility'], evaluationEligibility: 'not-evaluable' },
  { id: 'mineral-sanitizer', code: 'MINERAL_SANITIZER', name: 'Sistema mineral', category: 'non-chlorine-disinfection', functions: ['sanitation'], form: 'cartridge', component: 'Minerales sanitizantes', evaluationEligibility: 'not-evaluable' },
  { id: 'silver-ions', code: 'SILVER_IONS', name: 'Iones de plata', category: 'non-chlorine-disinfection', functions: ['sanitation'], form: 'unknown', component: 'Iones de plata', evaluationEligibility: 'not-evaluable' },
  { id: 'copper-ions', code: 'COPPER_IONS', name: 'Iones de cobre', category: 'non-chlorine-disinfection', functions: ['sanitation', 'algae-prevention'], form: 'unknown', component: 'Iones de cobre', mayAffect: [{ parameter: 'clarity', certainty: 'potential', notes: 'Puede relacionarse con manchas o coloraciones si hay metales.' }], evaluationEligibility: 'not-evaluable' },
  { id: 'enzyme-treatment', code: 'ENZYME_TREATMENT', name: 'Tratamiento enzimático', category: 'non-chlorine-disinfection', secondaryCategories: ['nutrients'], functions: ['maintenance'], form: 'liquid', component: 'Enzimas', evaluationEligibility: 'not-evaluable' },

  // 3-7. Balance químico, CYA y sal
  { id: 'ph-reducer-dry', code: 'PH_REDUCER_DRY', name: 'Reductor de pH granulado', category: 'ph-reducer', secondaryCategories: ['ph-regulation'], functions: ['ph-control'], form: 'granules', component: 'Ácido seco reductor de pH', lowers: [{ parameter: 'ph', certainty: 'manufacturer-claimed' }], evaluationEligibility: 'conditionally-evaluable' },
  { id: 'hydrochloric-acid', code: 'HYDROCHLORIC_ACID', name: 'Ácido clorhídrico / muriático', category: 'ph-reducer', secondaryCategories: ['ph-regulation'], functions: ['ph-control', 'alkalinity-control'], form: 'liquid', component: 'Ácido clorhídrico', lowers: [{ parameter: 'ph', certainty: 'known' }, { parameter: 'alkalinity', certainty: 'known' }], evaluationEligibility: 'conditionally-evaluable' },
  { id: 'sodium-bisulfate', code: 'SODIUM_BISULFATE', name: 'Bisulfato sódico', category: 'ph-reducer', secondaryCategories: ['ph-regulation', 'alkalinity'], functions: ['ph-control', 'alkalinity-control'], form: 'granules', component: 'Bisulfato sódico', evaluationEligibility: 'conditionally-evaluable' },
  { id: 'sulfuric-acid', code: 'SULFURIC_ACID', name: 'Ácido sulfúrico', category: 'ph-reducer', secondaryCategories: ['ph-regulation'], functions: ['ph-control', 'alkalinity-control'], form: 'liquid', component: 'Ácido sulfúrico', evaluationEligibility: 'conditionally-evaluable' },
  { id: 'sodium-carbonate', code: 'SODIUM_CARBONATE', name: 'Carbonato sódico', category: 'ph-increaser', secondaryCategories: ['ph-regulation'], functions: ['ph-control'], form: 'powder', component: 'Carbonato sódico', raises: [{ parameter: 'ph', certainty: 'known' }], evaluationEligibility: 'conditionally-evaluable' },
  { id: 'ph-regulator', code: 'PH_REGULATOR', name: 'Regulador de pH', category: 'ph-regulation', functions: ['ph-control'], form: 'unknown', component: 'Regulador de pH', evaluationEligibility: 'not-evaluable' },
  { id: 'alkalinity-increaser', code: 'ALKALINITY_INCREASER', name: 'Incrementador de alcalinidad', category: 'alkalinity', functions: ['alkalinity-control'], form: 'powder', component: 'Alcalinizante', raises: [{ parameter: 'alkalinity', certainty: 'manufacturer-claimed' }], evaluationEligibility: 'not-evaluable' },
  { id: 'sodium-bicarbonate', code: 'SODIUM_BICARBONATE', name: 'Bicarbonato sódico', category: 'alkalinity', functions: ['alkalinity-control'], form: 'powder', component: 'Bicarbonato sódico', raises: [{ parameter: 'alkalinity', certainty: 'known' }], evaluationEligibility: 'not-evaluable' },
  { id: 'alkalinity-stabilizer', code: 'ALKALINITY_STABILIZER', name: 'Estabilizador de alcalinidad', category: 'alkalinity', functions: ['alkalinity-control'], form: 'unknown', component: 'Estabilizador de alcalinidad', evaluationEligibility: 'not-evaluable' },
  { id: 'calcium-hardness-increaser', code: 'CALCIUM_HARDNESS_INCREASER', name: 'Incrementador de dureza cálcica', category: 'calcium-hardness', functions: ['hardness-control'], form: 'granules', component: 'Sales de calcio', raises: [{ parameter: 'calcium-hardness', certainty: 'manufacturer-claimed' }], evaluationEligibility: 'not-evaluable' },
  { id: 'calcium-chloride', code: 'CALCIUM_CHLORIDE', name: 'Cloruro cálcico', category: 'calcium-hardness', functions: ['hardness-control'], form: 'granules', component: 'Cloruro cálcico', raises: [{ parameter: 'calcium-hardness', certainty: 'known' }], evaluationEligibility: 'not-evaluable' },
  { id: 'calcium-hardness-reducer', code: 'CALCIUM_HARDNESS_REDUCER', name: 'Reductor de dureza', category: 'calcium-hardness', functions: ['hardness-control'], form: 'unknown', component: 'Tratamiento de dureza', evaluationEligibility: 'not-evaluable', notes: 'No presentarlo como corrección directa si actúa por dilución, ósmosis o secuestro temporal.' },
  { id: 'calcium-sequestrant', code: 'CALCIUM_SEQUESTRANT', name: 'Secuestrante de calcio', category: 'calcium-hardness', functions: ['hardness-control'], form: 'liquid', component: 'Secuestrante de calcio', evaluationEligibility: 'not-evaluable' },
  { id: 'remineralizer', code: 'REMINERALIZER', name: 'Remineralizador', category: 'calcium-hardness', functions: ['hardness-control'], form: 'solid', component: 'Minerales', evaluationEligibility: 'not-evaluable' },
  { id: 'cyanuric-acid', code: 'CYANURIC_ACID', name: 'Ácido cianúrico', category: 'cyanuric-acid', secondaryCategories: ['stabilizer'], functions: ['stabilization'], form: 'granules', component: 'Ácido cianúrico', concentrationPercent: 100, raises: [{ parameter: 'cya', certainty: 'known' }], evaluationEligibility: 'not-evaluable' },
  { id: 'cya-increaser', code: 'CYA_INCREASER', name: 'Incrementador de CYA', category: 'cyanuric-acid', functions: ['stabilization'], form: 'granules', component: 'Ácido cianúrico o estabilizante', raises: [{ parameter: 'cya', certainty: 'manufacturer-claimed' }], evaluationEligibility: 'not-evaluable' },
  { id: 'cya-reducer', code: 'CYA_REDUCER', name: 'Reductor de CYA', category: 'cyanuric-acid', functions: ['stabilization'], form: 'unknown', component: 'Tratamiento reductor de estabilizante', lowers: [{ parameter: 'cya', certainty: 'manufacturer-claimed' }], evaluationEligibility: 'not-evaluable', notes: 'No asumir eficacia del producto comercial sin mediciones manuales.' },
  { id: 'cya-removal-treatment', code: 'CYA_REMOVAL_TREATMENT', name: 'Tratamiento de eliminación de ácido cianúrico', category: 'cyanuric-acid', functions: ['stabilization'], form: 'unknown', component: 'Tratamiento especializado de CYA', evaluationEligibility: 'not-evaluable' },
  { id: 'high-purity-pool-salt', code: 'HIGH_PURITY_POOL_SALT', name: 'Sal de alta pureza', category: 'salt', secondaryCategories: ['salt-system'], functions: ['salt-increase'], form: 'solid', component: 'Cloruro sódico de alta pureza', concentrationPercent: 99, appliesTo: ['saltwater'], evaluationEligibility: 'evaluable' },
  { id: 'salt-increaser', code: 'SALT_INCREASER', name: 'Incrementador de sal', category: 'salt', secondaryCategories: ['salt-system'], functions: ['salt-increase'], form: 'solid', component: 'Sal para electrólisis salina', appliesTo: ['saltwater'], evaluationEligibility: 'evaluable' },
  { id: 'magnesium-mineral-blend', code: 'MAGNESIUM_MINERAL_BLEND', name: 'Mezcla mineral de magnesio y potasio', category: 'salt-system', functions: ['maintenance'], form: 'solid', component: 'Sales minerales', appliesTo: ['saltwater'], evaluationEligibility: 'not-evaluable' },
  { id: 'cell-cleaner', code: 'CELL_CLEANER', name: 'Limpiador de célula salina', category: 'equipment-cleaning', secondaryCategories: ['salt-system'], functions: ['equipment-cleaning'], form: 'liquid', target: 'equipment', component: 'Limpiador de célula', appliesTo: ['saltwater'], evaluationEligibility: 'not-evaluable' },
  { id: 'cell-descaler', code: 'CELL_DESCALER', name: 'Desincrustante de célula', category: 'equipment-cleaning', secondaryCategories: ['salt-system'], functions: ['equipment-cleaning'], form: 'liquid', target: 'equipment', component: 'Desincrustante de célula', appliesTo: ['saltwater'], evaluationEligibility: 'not-evaluable' },
  { id: 'cell-scale-preventer', code: 'CELL_SCALE_PREVENTER', name: 'Aditivo preventivo de incrustaciones', category: 'salt-system', functions: ['maintenance'], form: 'liquid', component: 'Preventivo de incrustaciones', appliesTo: ['saltwater'], evaluationEligibility: 'not-evaluable' },
  { id: 'salt-system-additive', code: 'SALT_SYSTEM_ADDITIVE', name: 'Aditivo para electrólisis salina', category: 'salt-system', functions: ['maintenance'], form: 'liquid', component: 'Aditivo compatible con cloración salina', appliesTo: ['saltwater'], evaluationEligibility: 'not-evaluable' },

  // 8-13. Algas, claridad, metales, nutrientes, cubiertas e invernaje
  { id: 'algaecide-preventive', code: 'ALGAECIDE_PREVENTIVE', name: 'Algicida preventivo', category: 'algaecide', functions: ['algae-prevention'], form: 'liquid', component: 'Algicida preventivo', evaluationEligibility: 'not-evaluable' },
  { id: 'algaecide-shock', code: 'ALGAECIDE_SHOCK', name: 'Algicida de choque', category: 'algaecide', functions: ['algae-treatment'], form: 'liquid', component: 'Algicida de choque', evaluationEligibility: 'not-evaluable' },
  { id: 'non-foaming-algaecide', code: 'NON_FOAMING_ALGAECIDE', name: 'Algicida no espumante', category: 'algaecide', functions: ['algae-prevention'], form: 'liquid', component: 'Algicida no espumante', evaluationEligibility: 'not-evaluable' },
  { id: 'quaternary-ammonium-algaecide', code: 'QUATERNARY_AMMONIUM_ALGAECIDE', name: 'Algicida de amonio cuaternario', category: 'algaecide', functions: ['algae-prevention', 'algae-treatment'], form: 'liquid', component: 'Amonio cuaternario', evaluationEligibility: 'not-evaluable' },
  { id: 'polymeric-algaecide', code: 'POLYMERIC_ALGAECIDE', name: 'Algicida polimérico', category: 'algaecide', functions: ['algae-prevention'], form: 'liquid', component: 'Algicida polimérico', evaluationEligibility: 'not-evaluable' },
  { id: 'copper-algaecide', code: 'COPPER_ALGAECIDE', name: 'Algicida con cobre', category: 'algaecide', functions: ['algae-prevention'], form: 'liquid', component: 'Compuesto de cobre', mayAffect: [{ parameter: 'clarity', certainty: 'potential', notes: 'Puede interactuar con metales/manchas.' }], evaluationEligibility: 'not-evaluable' },
  { id: 'copper-free-algaecide', code: 'COPPER_FREE_ALGAECIDE', name: 'Algicida sin cobre', category: 'algaecide', functions: ['algae-prevention'], form: 'liquid', component: 'Algicida sin cobre', evaluationEligibility: 'not-evaluable' },
  { id: 'green-algae-treatment', code: 'GREEN_ALGAE_TREATMENT', name: 'Tratamiento para algas verdes', category: 'algaecide', functions: ['algae-treatment'], form: 'unknown', component: 'Tratamiento para algas verdes', evaluationEligibility: 'not-evaluable' },
  { id: 'mustard-algae-treatment', code: 'MUSTARD_ALGAE_TREATMENT', name: 'Tratamiento para algas amarillas o mostaza', category: 'algaecide', functions: ['algae-treatment'], form: 'unknown', component: 'Tratamiento para algas mostaza', evaluationEligibility: 'not-evaluable' },
  { id: 'black-algae-treatment', code: 'BLACK_ALGAE_TREATMENT', name: 'Tratamiento para algas negras', category: 'algaecide', functions: ['algae-treatment'], form: 'unknown', component: 'Tratamiento para algas negras', evaluationEligibility: 'not-evaluable' },
  { id: 'clarifier', code: 'CLARIFIER', name: 'Clarificante', category: 'clarifier', functions: ['clarification'], form: 'liquid', component: 'Clarificante', evaluationEligibility: 'not-evaluable' },
  { id: 'liquid-clarifier', code: 'LIQUID_CLARIFIER', name: 'Clarificante líquido', category: 'clarifier', functions: ['clarification'], form: 'liquid', component: 'Clarificante líquido', evaluationEligibility: 'not-evaluable' },
  { id: 'tablet-clarifier', code: 'TABLET_CLARIFIER', name: 'Clarificante en tabletas', category: 'clarifier', functions: ['clarification'], form: 'tablets', component: 'Clarificante en tabletas', evaluationEligibility: 'not-evaluable' },
  { id: 'flocculant', code: 'FLOCCULANT', name: 'Floculante', category: 'flocculant', functions: ['flocculation'], form: 'unknown', component: 'Floculante', evaluationEligibility: 'not-evaluable' },
  { id: 'liquid-flocculant', code: 'LIQUID_FLOCCULANT', name: 'Floculante líquido', category: 'flocculant', functions: ['flocculation'], form: 'liquid', component: 'Floculante líquido', evaluationEligibility: 'not-evaluable' },
  { id: 'flocculant-cartridge', code: 'FLOCCULANT_CARTRIDGE', name: 'Floculante en cartucho', category: 'flocculant', functions: ['flocculation'], form: 'cartridge', component: 'Floculante en cartucho', evaluationEligibility: 'not-evaluable' },
  { id: 'aluminum-sulfate', code: 'ALUMINUM_SULFATE', name: 'Sulfato de aluminio', category: 'flocculant', functions: ['flocculation'], form: 'powder', component: 'Sulfato de aluminio', evaluationEligibility: 'not-evaluable' },
  { id: 'coagulant', code: 'COAGULANT', name: 'Coagulante', category: 'clarifier', secondaryCategories: ['flocculant'], functions: ['clarification', 'flocculation'], form: 'liquid', component: 'Coagulante', evaluationEligibility: 'not-evaluable' },
  { id: 'turbidity-remover', code: 'TURBIDITY_REMOVER', name: 'Eliminador de turbidez', category: 'clarifier', functions: ['clarification'], form: 'liquid', component: 'Producto eliminador de turbidez', evaluationEligibility: 'not-evaluable' },
  { id: 'filter-aid', code: 'FILTER_AID', name: 'Auxiliar de filtración', category: 'clarifier', secondaryCategories: ['filter-cleaning'], functions: ['clarification', 'maintenance'], form: 'powder', target: 'filter', component: 'Auxiliar de filtro', evaluationEligibility: 'not-evaluable' },
  { id: 'filter-cellulose', code: 'FILTER_CELLULOSE', name: 'Celulosa filtrante', category: 'clarifier', secondaryCategories: ['filter-cleaning'], functions: ['maintenance'], form: 'powder', target: 'filter', component: 'Celulosa filtrante', evaluationEligibility: 'not-evaluable' },
  { id: 'diatomaceous-earth', code: 'DIATOMACEOUS_EARTH', name: 'Tierra de diatomeas', category: 'clarifier', secondaryCategories: ['filter-cleaning'], functions: ['maintenance'], form: 'powder', target: 'filter', component: 'Tierra de diatomeas', evaluationEligibility: 'not-evaluable' },
  { id: 'metal-sequestrant', code: 'METAL_SEQUESTRANT', name: 'Secuestrante de metales', category: 'metals-stains', functions: ['metal-control'], form: 'liquid', component: 'Secuestrante de metales', evaluationEligibility: 'not-evaluable' },
  { id: 'iron-remover', code: 'IRON_REMOVER', name: 'Eliminador de hierro', category: 'metals-stains', functions: ['metal-control'], form: 'liquid', component: 'Tratamiento de hierro', evaluationEligibility: 'not-evaluable' },
  { id: 'copper-remover', code: 'COPPER_REMOVER', name: 'Eliminador de cobre', category: 'metals-stains', functions: ['metal-control'], form: 'liquid', component: 'Tratamiento de cobre', evaluationEligibility: 'not-evaluable' },
  { id: 'manganese-remover', code: 'MANGANESE_REMOVER', name: 'Eliminador de manganeso', category: 'metals-stains', functions: ['metal-control'], form: 'liquid', component: 'Tratamiento de manganeso', evaluationEligibility: 'not-evaluable' },
  { id: 'stain-preventer', code: 'STAIN_PREVENTER', name: 'Inhibidor de manchas', category: 'metals-stains', functions: ['stain-control'], form: 'liquid', component: 'Preventivo de manchas', evaluationEligibility: 'not-evaluable' },
  { id: 'metal-stain-treatment', code: 'METAL_STAIN_TREATMENT', name: 'Tratamiento de manchas metálicas', category: 'metals-stains', functions: ['stain-control'], form: 'unknown', target: 'pool-surface', component: 'Tratamiento de manchas metálicas', evaluationEligibility: 'not-evaluable' },
  { id: 'ascorbic-acid', code: 'ASCORBIC_ACID', name: 'Ácido ascórbico', category: 'metals-stains', functions: ['stain-control'], form: 'powder', component: 'Ácido ascórbico', evaluationEligibility: 'not-evaluable' },
  { id: 'organic-stain-remover', code: 'ORGANIC_STAIN_REMOVER', name: 'Tratamiento de manchas orgánicas', category: 'metals-stains', functions: ['stain-control'], form: 'unknown', target: 'pool-surface', component: 'Tratamiento de manchas orgánicas', evaluationEligibility: 'not-evaluable' },
  { id: 'well-water-treatment', code: 'WELL_WATER_TREATMENT', name: 'Producto preventivo para agua de pozo', category: 'metals-stains', functions: ['metal-control'], form: 'liquid', component: 'Tratamiento para agua de pozo', evaluationEligibility: 'not-evaluable' },
  { id: 'chelating-agent', code: 'CHELATING_AGENT', name: 'Agente quelante', category: 'metals-stains', functions: ['metal-control'], form: 'liquid', component: 'Agente quelante', evaluationEligibility: 'not-evaluable' },
  { id: 'surface-descaler', code: 'SURFACE_DESCALER', name: 'Desincrustante de superficies', category: 'surface-cleaning', secondaryCategories: ['metals-stains'], functions: ['surface-cleaning'], form: 'liquid', target: 'pool-surface', component: 'Desincrustante de superficies', evaluationEligibility: 'not-evaluable' },
  { id: 'waterline-cleaner', code: 'WATERLINE_CLEANER', name: 'Limpiador de línea de flotación', category: 'surface-cleaning', functions: ['surface-cleaning'], form: 'gel', target: 'waterline', component: 'Limpiador de línea de flotación', evaluationEligibility: 'not-evaluable' },
  { id: 'phosphate-remover', code: 'PHOSPHATE_REMOVER', name: 'Eliminador de fosfatos', category: 'nutrients', functions: ['phosphate-control'], form: 'liquid', component: 'Removedor de fosfatos', evaluationEligibility: 'not-evaluable' },
  { id: 'phosphate-reducer', code: 'PHOSPHATE_REDUCER', name: 'Reductor de fosfatos', category: 'nutrients', functions: ['phosphate-control'], form: 'liquid', component: 'Reductor de fosfatos', evaluationEligibility: 'not-evaluable' },
  { id: 'nitrate-reducer', code: 'NITRATE_REDUCER', name: 'Eliminador de nitratos', category: 'nutrients', functions: ['nitrate-control'], form: 'liquid', component: 'Reductor de nitratos', evaluationEligibility: 'not-evaluable' },
  { id: 'organic-contaminant-treatment', code: 'ORGANIC_CONTAMINANT_TREATMENT', name: 'Producto para contaminación orgánica', category: 'nutrients', functions: ['maintenance'], form: 'liquid', component: 'Tratamiento de contaminación orgánica', evaluationEligibility: 'not-evaluable' },
  { id: 'enzyme-cleaner', code: 'ENZYME_CLEANER', name: 'Tratamiento enzimático de residuos', category: 'nutrients', functions: ['maintenance'], form: 'liquid', component: 'Enzimas limpiadoras', evaluationEligibility: 'not-evaluable' },
  { id: 'oil-and-grease-digester', code: 'OIL_AND_GREASE_DIGESTER', name: 'Digestor de aceites y grasas', category: 'nutrients', functions: ['maintenance'], form: 'liquid', component: 'Digestor de aceites y grasas', evaluationEligibility: 'not-evaluable' },
  { id: 'chemical-pool-cover', code: 'CHEMICAL_POOL_COVER', name: 'Cubierta química', category: 'chemical-cover', functions: ['evaporation-reduction'], form: 'liquid', component: 'Cubierta líquida', evaluationEligibility: 'not-evaluable' },
  { id: 'liquid-pool-cover', code: 'LIQUID_POOL_COVER', name: 'Cubierta líquida', category: 'chemical-cover', functions: ['evaporation-reduction'], form: 'liquid', component: 'Barrera líquida antievaporación', evaluationEligibility: 'not-evaluable' },
  { id: 'evaporation-reducer', code: 'EVAPORATION_REDUCER', name: 'Reductor de evaporación', category: 'chemical-cover', functions: ['evaporation-reduction'], form: 'liquid', component: 'Aditivo reductor de evaporación', evaluationEligibility: 'conditionally-evaluable', notes: 'Solo evaluar evaporación o pérdida de temperatura si existen mediciones adecuadas.' },
  { id: 'heat-retention-additive', code: 'HEAT_RETENTION_ADDITIVE', name: 'Producto conservador de temperatura', category: 'chemical-cover', functions: ['evaporation-reduction'], form: 'liquid', component: 'Aditivo de retención térmica', evaluationEligibility: 'conditionally-evaluable' },
  { id: 'winterizer', code: 'WINTERIZER', name: 'Producto de invernaje', category: 'winterizing', functions: ['winterizing'], form: 'liquid', component: 'Invernador', evaluationEligibility: 'not-evaluable' },
  { id: 'copper-free-winterizer', code: 'COPPER_FREE_WINTERIZER', name: 'Invernador sin cobre', category: 'winterizing', functions: ['winterizing'], form: 'liquid', component: 'Invernador sin cobre', evaluationEligibility: 'not-evaluable' },
  { id: 'winter-algaecide', code: 'WINTER_ALGAECIDE', name: 'Invernador con algicida', category: 'winterizing', secondaryCategories: ['algaecide'], functions: ['winterizing', 'algae-prevention'], form: 'liquid', component: 'Invernador con algicida', evaluationEligibility: 'not-evaluable' },
  { id: 'pool-closing-kit', code: 'POOL_CLOSING_KIT', name: 'Kit de cierre de piscina', category: 'winterizing', secondaryCategories: ['multifunction'], functions: ['winterizing', 'maintenance'], form: 'unknown', component: 'Componentes múltiples de cierre', evaluationEligibility: 'not-evaluable' },
  { id: 'pool-opening-treatment', code: 'POOL_OPENING_TREATMENT', name: 'Producto de apertura', category: 'winterizing', functions: ['maintenance'], form: 'unknown', component: 'Tratamiento de apertura', evaluationEligibility: 'not-evaluable' },
  { id: 'post-winter-recovery', code: 'POST_WINTER_RECOVERY', name: 'Tratamiento de recuperación tras invierno', category: 'winterizing', functions: ['maintenance'], form: 'unknown', component: 'Tratamiento de recuperación', evaluationEligibility: 'not-evaluable' },
  { id: 'winter-scale-preventer', code: 'WINTER_SCALE_PREVENTER', name: 'Protector frente a incrustaciones durante invernaje', category: 'winterizing', functions: ['winterizing'], form: 'liquid', component: 'Preventivo de incrustaciones', evaluationEligibility: 'not-evaluable' },
  { id: 'pool-plumbing-antifreeze', code: 'POOL_PLUMBING_ANTIFREEZE', name: 'Anticongelante específico para circuitos compatibles', category: 'winterizing', secondaryCategories: ['equipment-cleaning'], functions: ['maintenance'], form: 'liquid', target: 'plumbing', component: 'Anticongelante compatible', evaluationEligibility: 'not-evaluable' },

  // 14-20. Limpieza, neutralizadores, multifunción, spa y otros
  { id: 'pool-degreaser', code: 'POOL_DEGREASER', name: 'Limpiador desengrasante', category: 'surface-cleaning', functions: ['surface-cleaning'], form: 'liquid', target: 'pool-surface', component: 'Desengrasante', evaluationEligibility: 'not-evaluable' },
  { id: 'liner-cleaner', code: 'LINER_CLEANER', name: 'Limpiador de liner', category: 'surface-cleaning', functions: ['surface-cleaning'], form: 'liquid', target: 'pool-surface', component: 'Limpiador de liner', evaluationEligibility: 'not-evaluable' },
  { id: 'tile-cleaner', code: 'TILE_CLEANER', name: 'Limpiador de gresite', category: 'surface-cleaning', functions: ['surface-cleaning'], form: 'liquid', target: 'pool-surface', component: 'Limpiador de gresite', evaluationEligibility: 'not-evaluable' },
  { id: 'fiberglass-cleaner', code: 'FIBERGLASS_CLEANER', name: 'Limpiador de fibra', category: 'surface-cleaning', functions: ['surface-cleaning'], form: 'liquid', target: 'pool-surface', component: 'Limpiador de fibra', evaluationEligibility: 'not-evaluable' },
  { id: 'stainless-steel-cleaner', code: 'STAINLESS_STEEL_CLEANER', name: 'Limpiador de acero inoxidable', category: 'surface-cleaning', functions: ['surface-cleaning'], form: 'liquid', target: 'equipment', component: 'Limpiador de acero inoxidable', evaluationEligibility: 'not-evaluable' },
  { id: 'stone-cleaner', code: 'STONE_CLEANER', name: 'Limpiador de piedra', category: 'surface-cleaning', functions: ['surface-cleaning'], form: 'liquid', target: 'surrounding-area', component: 'Limpiador de piedra', evaluationEligibility: 'not-evaluable' },
  { id: 'limescale-remover', code: 'LIMESCALE_REMOVER', name: 'Eliminador de cal', category: 'surface-cleaning', functions: ['surface-cleaning'], form: 'liquid', target: 'pool-surface', component: 'Eliminador de cal', evaluationEligibility: 'not-evaluable' },
  { id: 'rust-remover', code: 'RUST_REMOVER', name: 'Eliminador de óxido', category: 'surface-cleaning', functions: ['surface-cleaning'], form: 'liquid', target: 'pool-surface', component: 'Eliminador de óxido', evaluationEligibility: 'not-evaluable' },
  { id: 'acid-surface-cleaner', code: 'ACID_SURFACE_CLEANER', name: 'Limpiador ácido', category: 'surface-cleaning', functions: ['surface-cleaning'], form: 'liquid', target: 'pool-surface', component: 'Limpiador ácido', evaluationEligibility: 'not-evaluable' },
  { id: 'alkaline-surface-cleaner', code: 'ALKALINE_SURFACE_CLEANER', name: 'Limpiador alcalino', category: 'surface-cleaning', functions: ['surface-cleaning'], form: 'liquid', target: 'pool-surface', component: 'Limpiador alcalino', evaluationEligibility: 'not-evaluable' },
  { id: 'physical-cover-cleaner', code: 'PHYSICAL_COVER_CLEANER', name: 'Limpiador de cubierta física', category: 'surface-cleaning', functions: ['surface-cleaning'], form: 'liquid', target: 'physical-cover', component: 'Limpiador de cubierta física', evaluationEligibility: 'not-evaluable' },
  { id: 'sand-filter-cleaner', code: 'SAND_FILTER_CLEANER', name: 'Limpiador de filtro de arena', category: 'filter-cleaning', functions: ['filter-cleaning'], form: 'liquid', target: 'filter', component: 'Limpiador de filtro de arena', evaluationEligibility: 'not-evaluable' },
  { id: 'filter-descaler', code: 'FILTER_DESCALER', name: 'Desincrustante de filtro', category: 'filter-cleaning', functions: ['filter-cleaning'], form: 'liquid', target: 'filter', component: 'Desincrustante de filtro', evaluationEligibility: 'not-evaluable' },
  { id: 'filter-degreaser', code: 'FILTER_DEGREASER', name: 'Desengrasante de filtro', category: 'filter-cleaning', functions: ['filter-cleaning'], form: 'liquid', target: 'filter', component: 'Desengrasante de filtro', evaluationEligibility: 'not-evaluable' },
  { id: 'cartridge-filter-cleaner', code: 'CARTRIDGE_FILTER_CLEANER', name: 'Limpiador de cartuchos', category: 'filter-cleaning', functions: ['filter-cleaning'], form: 'liquid', target: 'filter', component: 'Limpiador de cartuchos', evaluationEligibility: 'not-evaluable' },
  { id: 'de-filter-cleaner', code: 'DE_FILTER_CLEANER', name: 'Limpiador de diatomeas', category: 'filter-cleaning', functions: ['filter-cleaning'], form: 'liquid', target: 'filter', component: 'Limpiador de filtro de diatomeas', evaluationEligibility: 'not-evaluable' },
  { id: 'filter-media-cleaner', code: 'FILTER_MEDIA_CLEANER', name: 'Producto para material filtrante', category: 'filter-cleaning', functions: ['filter-cleaning'], form: 'liquid', target: 'filter', component: 'Limpiador de material filtrante', evaluationEligibility: 'not-evaluable' },
  { id: 'enzymatic-filter-cleaner', code: 'ENZYMATIC_FILTER_CLEANER', name: 'Limpiador enzimático de filtro', category: 'filter-cleaning', functions: ['filter-cleaning'], form: 'liquid', target: 'filter', component: 'Enzimas limpiadoras de filtro', evaluationEligibility: 'not-evaluable' },
  { id: 'filter-media-disinfectant', code: 'FILTER_MEDIA_DISINFECTANT', name: 'Desinfectante de material filtrante', category: 'filter-cleaning', functions: ['filter-cleaning', 'sanitation'], form: 'liquid', target: 'filter', component: 'Desinfectante de material filtrante', evaluationEligibility: 'not-evaluable' },
  { id: 'pipe-cleaner', code: 'PIPE_CLEANER', name: 'Limpiador de tuberías', category: 'equipment-cleaning', functions: ['equipment-cleaning'], form: 'liquid', target: 'plumbing', component: 'Limpiador de tuberías', evaluationEligibility: 'not-evaluable' },
  { id: 'plumbing-descaler', code: 'PLUMBING_DESCALER', name: 'Desincrustante de circuito', category: 'equipment-cleaning', functions: ['equipment-cleaning'], form: 'liquid', target: 'plumbing', component: 'Desincrustante de circuito', evaluationEligibility: 'not-evaluable' },
  { id: 'heat-exchanger-cleaner', code: 'HEAT_EXCHANGER_CLEANER', name: 'Limpiador de intercambiador', category: 'equipment-cleaning', functions: ['equipment-cleaning'], form: 'liquid', target: 'equipment', component: 'Limpiador de intercambiador', evaluationEligibility: 'not-evaluable' },
  { id: 'pump-cleaner', code: 'PUMP_CLEANER', name: 'Limpiador de bomba', category: 'equipment-cleaning', functions: ['equipment-cleaning'], form: 'liquid', target: 'equipment', component: 'Limpiador de bomba', evaluationEligibility: 'not-evaluable' },
  { id: 'biofilm-remover', code: 'BIOFILM_REMOVER', name: 'Tratamiento contra biofilm', category: 'equipment-cleaning', functions: ['equipment-cleaning'], form: 'liquid', target: 'plumbing', component: 'Tratamiento contra biofilm', evaluationEligibility: 'not-evaluable' },
  { id: 'spa-pipe-purge', code: 'SPA_PIPE_PURGE', name: 'Producto para purga de tuberías', category: 'equipment-cleaning', secondaryCategories: ['spa'], functions: ['equipment-cleaning'], form: 'liquid', target: 'plumbing', component: 'Purga de tuberías', evaluationEligibility: 'not-evaluable' },
  { id: 'pool-equipment-lubricant', code: 'POOL_EQUIPMENT_LUBRICANT', name: 'Lubricante compatible para juntas', category: 'equipment-cleaning', functions: ['maintenance'], form: 'gel', target: 'equipment', component: 'Lubricante compatible', evaluationEligibility: 'not-evaluable' },
  { id: 'corrosion-inhibitor', code: 'CORROSION_INHIBITOR', name: 'Protector anticorrosión', category: 'equipment-cleaning', functions: ['maintenance'], form: 'liquid', target: 'equipment', component: 'Inhibidor de corrosión', evaluationEligibility: 'not-evaluable' },
  { id: 'chlorine-neutralizer', code: 'CHLORINE_NEUTRALIZER', name: 'Neutralizador de cloro', category: 'neutralizer', functions: ['neutralization'], form: 'unknown', component: 'Neutralizador de cloro', lowers: [{ parameter: 'fac', certainty: 'manufacturer-claimed' }], evaluationEligibility: 'not-evaluable' },
  { id: 'sodium-thiosulfate', code: 'SODIUM_THIOSULFATE', name: 'Tiosulfato sódico', category: 'neutralizer', functions: ['neutralization'], form: 'powder', component: 'Tiosulfato sódico', lowers: [{ parameter: 'fac', certainty: 'known' }], evaluationEligibility: 'not-evaluable' },
  { id: 'bromine-neutralizer', code: 'BROMINE_NEUTRALIZER', name: 'Neutralizador de bromo', category: 'neutralizer', functions: ['neutralization'], form: 'unknown', component: 'Neutralizador de bromo', evaluationEligibility: 'not-evaluable' },
  { id: 'peroxide-neutralizer', code: 'PEROXIDE_NEUTRALIZER', name: 'Neutralizador de peróxido', category: 'neutralizer', functions: ['neutralization'], form: 'unknown', component: 'Neutralizador de peróxido', evaluationEligibility: 'not-evaluable' },
  { id: 'acid-neutralizer', code: 'ACID_NEUTRALIZER', name: 'Neutralizador de ácido', category: 'neutralizer', functions: ['neutralization'], form: 'unknown', component: 'Neutralizador de ácido', evaluationEligibility: 'not-evaluable' },
  { id: 'overdose-correction-product', code: 'OVERDOSE_CORRECTION_PRODUCT', name: 'Producto para corregir sobredosificación', category: 'neutralizer', functions: ['neutralization'], form: 'unknown', component: 'Corrector de sobredosificación', evaluationEligibility: 'not-evaluable' },
  { id: 'defoamer', code: 'DEFOAMER', name: 'Antiespumante', category: 'neutralizer', secondaryCategories: ['spa'], functions: ['maintenance'], form: 'liquid', component: 'Antiespumante', evaluationEligibility: 'not-evaluable' },
  { id: 'multifunction-product', code: 'MULTIFUNCTION_PRODUCT', name: 'Producto multifunción', category: 'multifunction', functions: ['maintenance', 'sanitation', 'algae-prevention', 'clarification'], form: 'unknown', component: 'Componentes múltiples no especificados', evaluationEligibility: 'conditionally-evaluable' },
  { id: 'multiaction-tablet', code: 'MULTIACTION_TABLET', name: 'Tableta multifunción', category: 'multifunction', functions: ['sanitation', 'algae-prevention', 'clarification', 'stabilization'], form: 'tablets', component: 'Componentes múltiples no especificados', evaluationEligibility: 'conditionally-evaluable' },
  { id: 'chlorine-with-algaecide', code: 'CHLORINE_WITH_ALGAECIDE', name: 'Cloro con algicida', category: 'multifunction', secondaryCategories: ['chlorine-disinfection', 'algaecide'], functions: ['sanitation', 'algae-prevention'], form: 'tablets', component: 'Cloro con algicida', evaluationEligibility: 'conditionally-evaluable' },
  { id: 'chlorine-with-clarifier', code: 'CHLORINE_WITH_CLARIFIER', name: 'Cloro con clarificante', category: 'multifunction', secondaryCategories: ['chlorine-disinfection', 'clarifier'], functions: ['sanitation', 'clarification'], form: 'tablets', component: 'Cloro con clarificante', evaluationEligibility: 'conditionally-evaluable' },
  { id: 'chlorine-with-stabilizer', code: 'CHLORINE_WITH_STABILIZER', name: 'Cloro con estabilizador', category: 'multifunction', secondaryCategories: ['chlorine-disinfection', 'stabilizer'], functions: ['sanitation', 'stabilization'], form: 'tablets', component: 'Cloro estabilizado', stabilizedChlorine: true, mayAffect: [{ parameter: 'cya', certainty: 'potential' }], evaluationEligibility: 'conditionally-evaluable' },
  { id: 'weekly-maintenance-product', code: 'WEEKLY_MAINTENANCE_PRODUCT', name: 'Producto semanal', category: 'multifunction', functions: ['maintenance'], form: 'unknown', component: 'Componentes múltiples no especificados', evaluationEligibility: 'not-evaluable' },
  { id: 'single-dose-treatment', code: 'SINGLE_DOSE_TREATMENT', name: 'Tratamiento monodosis', category: 'multifunction', functions: ['maintenance'], form: 'solid', component: 'Tratamiento monodosis', evaluationEligibility: 'not-evaluable' },
  { id: 'spa-sanitizer', code: 'SPA_SANITIZER', name: 'Desinfectante para spa', category: 'spa', functions: ['sanitation'], form: 'unknown', component: 'Desinfectante para spa', evaluationEligibility: 'conditionally-evaluable' },
  { id: 'spa-bromine', code: 'SPA_BROMINE', name: 'Bromo para spa', category: 'spa', secondaryCategories: ['non-chlorine-disinfection'], functions: ['sanitation'], form: 'tablets', component: 'Bromo para spa', evaluationEligibility: 'conditionally-evaluable' },
  { id: 'spa-active-oxygen', code: 'SPA_ACTIVE_OXYGEN', name: 'Oxígeno activo para spa', category: 'spa', secondaryCategories: ['non-chlorine-disinfection'], functions: ['oxidation'], form: 'granules', component: 'Oxígeno activo para spa', evaluationEligibility: 'conditionally-evaluable' },
  { id: 'spa-clarifier', code: 'SPA_CLARIFIER', name: 'Clarificante para spa', category: 'spa', secondaryCategories: ['clarifier'], functions: ['clarification'], form: 'liquid', component: 'Clarificante para spa', evaluationEligibility: 'not-evaluable' },
  { id: 'spa-defoamer', code: 'SPA_DEFOAMER', name: 'Antiespumante para spa', category: 'spa', functions: ['maintenance'], form: 'liquid', component: 'Antiespumante para spa', evaluationEligibility: 'not-evaluable' },
  { id: 'spa-pipe-cleaner', code: 'SPA_PIPE_CLEANER', name: 'Limpiador de tuberías de spa', category: 'spa', secondaryCategories: ['equipment-cleaning'], functions: ['equipment-cleaning'], form: 'liquid', target: 'plumbing', component: 'Limpiador de tuberías de spa', evaluationEligibility: 'not-evaluable' },
  { id: 'spa-fragrance', code: 'SPA_FRAGRANCE', name: 'Aromatizante compatible para spa', category: 'spa', functions: ['maintenance'], form: 'liquid', component: 'Aromatizante compatible', evaluationEligibility: 'not-evaluable' },
  { id: 'leak-detection-dye', code: 'LEAK_DETECTION_DYE', name: 'Tinte detector de fugas', category: 'other', functions: ['maintenance'], form: 'liquid', component: 'Tinte detector', evaluationEligibility: 'not-evaluable' },
  { id: 'leak-sealer', code: 'LEAK_SEALER', name: 'Producto sellador de pequeñas fugas', category: 'other', functions: ['maintenance'], form: 'liquid', component: 'Sellador de fugas', evaluationEligibility: 'not-evaluable' },
  { id: 'water-preservative', code: 'WATER_PRESERVATIVE', name: 'Conservante de agua', category: 'other', functions: ['maintenance'], form: 'liquid', component: 'Conservante de agua', evaluationEligibility: 'not-evaluable' },
  { id: 'pool-dye', code: 'POOL_DYE', name: 'Colorante para piscina', category: 'other', functions: ['maintenance'], form: 'liquid', component: 'Colorante', evaluationEligibility: 'not-evaluable' },
  { id: 'pool-fragrance', code: 'POOL_FRAGRANCE', name: 'Aromatizante', category: 'other', functions: ['maintenance'], form: 'liquid', component: 'Aromatizante', evaluationEligibility: 'not-evaluable' },
  { id: 'test-reagent', code: 'TEST_REAGENT', name: 'Reactivo de análisis', category: 'measurement-consumable', functions: ['measurement-consumable'], form: 'liquid', target: 'other', component: 'Reactivo de análisis', evaluationEligibility: 'not-evaluable' },
  { id: 'calibration-solution', code: 'CALIBRATION_SOLUTION', name: 'Solución de calibración', category: 'measurement-consumable', functions: ['measurement-consumable'], form: 'liquid', target: 'other', component: 'Solución de calibración', evaluationEligibility: 'not-evaluable' },
  { id: 'probe-storage-solution', code: 'PROBE_STORAGE_SOLUTION', name: 'Solución de almacenamiento de sonda', category: 'measurement-consumable', functions: ['measurement-consumable'], form: 'liquid', target: 'equipment', component: 'Solución de almacenamiento de sonda', evaluationEligibility: 'not-evaluable' },
  { id: 'probe-cleaner', code: 'PROBE_CLEANER', name: 'Limpiador de electrodo', category: 'measurement-consumable', functions: ['measurement-consumable'], form: 'liquid', target: 'equipment', component: 'Limpiador de electrodo', evaluationEligibility: 'not-evaluable' },
  { id: 'unknown-product', code: 'UNKNOWN_PRODUCT', name: 'Producto no identificado', category: 'unknown', functions: ['unknown'], form: 'unknown', component: 'Composición desconocida', evaluationEligibility: 'unknown' },
  { id: 'custom-product-template', code: 'CUSTOM_PRODUCT', name: 'Otro producto personalizado', category: 'custom-product', functions: ['other'], form: 'unknown', component: 'Definido por el usuario', evaluationEligibility: 'unknown' },
  { id: 'other-product', code: 'OTHER_PRODUCT', name: 'Otro producto', category: 'other', functions: ['other'], form: 'unknown', component: 'Composición no especificada', evaluationEligibility: 'unknown' },
];

export const CATALOG: ChemicalProduct[] = [
  ...CORE_PRODUCTS,
  ...STANDARD_PRODUCTS,
].map(makeProduct);

// ── Helpers ───────────────────────────────────────────────────────

export function getProductById(id: string): ChemicalProduct | undefined {
  return CATALOG.find((p) => p.id === id);
}

export function getProductsForPoolType(poolType: string): ChemicalProduct[] {
  return CATALOG.filter(
    (p) => p.appliesTo === 'all' || p.appliesTo.includes(poolType as PoolType),
  );
}

export function getProductsByCategory(category: ChemicalProductCategory): ChemicalProduct[] {
  return CATALOG.filter(
    (p) => p.primaryCategory === category || p.secondaryCategories.includes(category),
  );
}
