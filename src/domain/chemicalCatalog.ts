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

export interface ChemicalProduct {
  id: string;
  genericName: string;
  type: DosageType;
  mainComponent: string;
  purpose: string;
  concentration: {
    label: string;
    value?: number;
    unit?: '%' | 'g/l' | 'ppm';
  };
  availableChlorinePercent?: number;
  stabilized?: boolean;
  manufacturer?: string;
  appliesTo: 'all' | 'saltwater'[];
  dosageRule?: DosageRule;
  recommendedDoses: string[];
  limitations: string[];
  safetyNotes: string[];
}

// ── Catalog ───────────────────────────────────────────────────────

export const CHEMICAL_CATALOG_VERSION = '2.0.0';

export const CATALOG: ChemicalProduct[] = [
  {
    id: 'ph-reducer-liquid',
    genericName: 'Reductor de pH líquido',
    type: 'phDownLiquid',
    mainComponent: 'Ácido reductor de pH',
    purpose: 'Bajar el pH del agua',
    concentration: {
      label: 'Producto líquido genérico según dosificación de catálogo',
    },
    appliesTo: 'all',
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
    limitations: [],
    safetyNotes: [
      'Manejar con guantes y gafas de protección.',
      'Añadir gradualmente cerca del retorno de agua.',
      'No mezclar con otros productos químicos.',
    ],
  },
  {
    id: 'ph-increaser-liquid',
    genericName: 'Incrementador de pH líquido',
    type: 'phUpLiquid',
    mainComponent: 'Base alcalina incrementadora de pH',
    purpose: 'Subir el pH del agua',
    concentration: {
      label: 'Producto líquido genérico según dosificación de catálogo',
    },
    appliesTo: 'all',
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
    limitations: [],
    safetyNotes: [
      'Manejar con guantes y gafas de protección.',
      'Añadir gradualmente cerca del retorno de agua.',
      'No mezclar con otros productos químicos.',
    ],
  },
  {
    id: 'chlorine-granules',
    genericName: 'Cloro granulado',
    type: 'chlorineGranules',
    mainComponent: 'Cloro de disolución rápida',
    purpose: 'Aumentar el cloro libre disponible',
    concentration: {
      label: 'Dicloro granulado genérico 55% de cloro disponible',
      value: 55,
      unit: '%',
    },
    availableChlorinePercent: 55,
    stabilized: true,
    appliesTo: 'all',
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
    ],
    safetyNotes: [
      'Manejar con guantes y gafas de protección.',
      'No mezclar con ácidos u otros productos químicos.',
      'Añadir en horas de baja radiación solar.',
      'Esperar al menos 30 minutos antes de bañarse.',
    ],
  },
  {
    id: 'chlorine-stabilizer',
    genericName: 'Estabilizador de cloro',
    type: 'cyanuricAcid',
    mainComponent: 'Ácido cianúrico',
    purpose: 'Aumentar el estabilizador para proteger el cloro frente al sol',
    concentration: {
      label: 'Ácido cianúrico granulado genérico',
      value: 100,
      unit: '%',
    },
    availableChlorinePercent: 0,
    stabilized: true,
    appliesTo: 'all',
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
  },
  {
    id: 'total-alkalinity-reducer',
    genericName: 'Reductor de alcalinidad total',
    type: 'alkalinityReducer',
    mainComponent: 'Ácido reductor de alcalinidad',
    purpose: 'Bajar la alcalinidad total del agua',
    concentration: {
      label: 'Producto ácido genérico',
    },
    appliesTo: 'all',
    dosageRule: undefined,
    recommendedDoses: [
      'Depende de la alcalinidad total medida manualmente y del producto concreto.',
    ],
    limitations: [
      'El medidor digital no mide alcalinidad total. No calcular dosis sin una medición manual.',
    ],
    safetyNotes: [
      'Manejar con guantes y gafas de protección.',
      'Añadir gradualmente cerca del retorno de agua.',
    ],
  },
  {
    id: 'pool-salt',
    genericName: 'Sal para piscina',
    type: 'poolSalt',
    mainComponent: 'Cloruro sódico',
    purpose: 'Aumentar la concentración de sal en piscinas salinas',
    concentration: {
      label: 'Cloruro sódico para piscina',
      value: 99,
      unit: '%',
    },
    availableChlorinePercent: 0,
    stabilized: false,
    appliesTo: ['saltwater'],
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
  },
];

// ── Helpers ───────────────────────────────────────────────────────

export function getProductById(id: string): ChemicalProduct | undefined {
  return CATALOG.find((p) => p.id === id);
}

export function getProductsForPoolType(poolType: string): ChemicalProduct[] {
  return CATALOG.filter(
    (p) => p.appliesTo === 'all' || p.appliesTo.includes(poolType as 'saltwater'),
  );
}
