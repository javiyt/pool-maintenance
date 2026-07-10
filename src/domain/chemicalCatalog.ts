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
  mainComponent: string;
  purpose: string;
  appliesTo: 'all' | 'saltwater'[];
  dosageRule?: DosageRule;
  limitations: string[];
  safetyNotes: string[];
}

// ── Catalog ───────────────────────────────────────────────────────

export const CATALOG: ChemicalProduct[] = [
  {
    id: 'ph-reducer-liquid',
    genericName: 'Reductor de pH líquido',
    mainComponent: 'Ácido reductor de pH',
    purpose: 'Bajar el pH del agua',
    appliesTo: 'all',
    dosageRule: {
      type: 'phDownLiquid',
      amount: 750,
      amountUnit: 'ml',
      perVolumeM3: 50,
      changesValueBy: 0.1,
      changesUnit: 'pH',
    },
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
    mainComponent: 'Base alcalina incrementadora de pH',
    purpose: 'Subir el pH del agua',
    appliesTo: 'all',
    dosageRule: {
      type: 'phUpLiquid',
      amount: 1000,
      amountUnit: 'ml',
      perVolumeM3: 50,
      changesValueBy: 0.1,
      changesUnit: 'pH',
    },
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
    mainComponent: 'Cloro de disolución rápida',
    purpose: 'Aumentar el cloro libre disponible',
    appliesTo: 'all',
    dosageRule: {
      type: 'chlorineGranules',
      amount: 3,
      amountUnit: 'g',
      perVolumeM3: 1,
      changesValueBy: undefined,
      changesUnit: undefined,
    },
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
    mainComponent: 'Ácido cianúrico',
    purpose: 'Aumentar el estabilizador para proteger el cloro frente al sol',
    appliesTo: 'all',
    dosageRule: {
      type: 'cyanuricAcid',
      amount: 30,
      amountUnit: 'g',
      perVolumeM3: 1,
      changesValueBy: 30,
      changesUnit: 'ppm',
    },
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
    mainComponent: 'Ácido reductor de alcalinidad',
    purpose: 'Bajar la alcalinidad total del agua',
    appliesTo: 'all',
    dosageRule: undefined,
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
    mainComponent: 'Cloruro sódico',
    purpose: 'Aumentar la concentración de sal en piscinas salinas',
    appliesTo: ['saltwater'],
    dosageRule: {
      type: 'poolSalt',
      amount: 1,
      amountUnit: 'kg',
      perVolumeM3: 0,
      changesValueBy: undefined,
      changesUnit: undefined,
    },
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
