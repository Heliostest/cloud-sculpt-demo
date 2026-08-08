import {
  isCloudGenus,
  isHighCloudGenus,
  MAX_VOLUME_CLOUD_BODIES,
  type CloudGenus,
} from './params';

export type CloudBodyPath = 'volume' | 'local-volume' | 'high-sheet';

export interface CloudMorphologyRecipe {
  verticalDevelopment: number;
  cellScale: number;
  cellStrength: number;
  sheetUniformity: number;
  fiberStrength: number;
  fiberAngleDeg: number;
  anvilStrength: number;
  erosionScale: number;
}

const GENUS_MORPHOLOGY_DEFAULTS: Readonly<Record<CloudGenus, Readonly<CloudMorphologyRecipe>>> = {
  cumulus: { verticalDevelopment: 0.55, cellScale: 1, cellStrength: 0.8, sheetUniformity: 0.1, fiberStrength: 0, fiberAngleDeg: 0, anvilStrength: 0, erosionScale: 1 },
  stratus: { verticalDevelopment: 0.1, cellScale: 2, cellStrength: 0.05, sheetUniformity: 0.95, fiberStrength: 0, fiberAngleDeg: 0, anvilStrength: 0, erosionScale: 0.35 },
  stratocumulus: { verticalDevelopment: 0.2, cellScale: 1.2, cellStrength: 0.7, sheetUniformity: 0.6, fiberStrength: 0, fiberAngleDeg: 0, anvilStrength: 0, erosionScale: 0.75 },
  cumulonimbus: { verticalDevelopment: 1, cellScale: 0.8, cellStrength: 1, sheetUniformity: 0.15, fiberStrength: 0, fiberAngleDeg: 0, anvilStrength: 1, erosionScale: 1.2 },
  altocumulus: { verticalDevelopment: 0.25, cellScale: 0.7, cellStrength: 0.8, sheetUniformity: 0.4, fiberStrength: 0, fiberAngleDeg: 0, anvilStrength: 0, erosionScale: 0.8 },
  altostratus: { verticalDevelopment: 0.15, cellScale: 2.5, cellStrength: 0.1, sheetUniformity: 0.9, fiberStrength: 0, fiberAngleDeg: 0, anvilStrength: 0, erosionScale: 0.3 },
  nimbostratus: { verticalDevelopment: 0.35, cellScale: 2.8, cellStrength: 0.2, sheetUniformity: 0.98, fiberStrength: 0, fiberAngleDeg: 0, anvilStrength: 0, erosionScale: 0.25 },
  cirrus: { verticalDevelopment: 0.08, cellScale: 0.45, cellStrength: 0.15, sheetUniformity: 0.25, fiberStrength: 1, fiberAngleDeg: 20, anvilStrength: 0, erosionScale: 1.3 },
  cirrostratus: { verticalDevelopment: 0.05, cellScale: 3, cellStrength: 0.05, sheetUniformity: 0.98, fiberStrength: 0.25, fiberAngleDeg: 15, anvilStrength: 0, erosionScale: 0.25 },
  cirrocumulus: { verticalDevelopment: 0.1, cellScale: 0.35, cellStrength: 0.85, sheetUniformity: 0.35, fiberStrength: 0.15, fiberAngleDeg: 0, anvilStrength: 0, erosionScale: 1.1 },
};

export function createCloudMorphologyRecipe(genus: CloudGenus): CloudMorphologyRecipe {
  return { ...GENUS_MORPHOLOGY_DEFAULTS[genus] };
}

export interface CloudBodySnapshot {
  id: string;
  path: CloudBodyPath;
  genus: CloudGenus;
  placementLocked: boolean;
  cumulusDevelopment: number;
  baseKm: number;
  topKm: number;
  densityScale: number;
  detailAmount: number;
  coverage: number;
  bounded: boolean;
  centerX: number;
  centerZ: number;
  radiusX: number;
  radiusZ: number;
  rotationDeg: number;
  feather: number;
  windDeg: number;
  windSpeedMps: number;
  morphRate: number;
  lifeEnabled: boolean;
  lifeBirth: number;
  lifeGrow: number;
  lifeDecay: number;
  lifeDeath: number;
  lifePeak: number;
  lifeStart: number;
  morphology: CloudMorphologyRecipe;
}

export interface CloudBodyCollectionSnapshot {
  version: 3;
  bodies: CloudBodySnapshot[];
}

const CLOUD_BODY_PATHS = ['volume', 'local-volume', 'high-sheet'] as const;
const LEGACY_RUNTIME_DEFAULTS = {
  windDeg: 35,
  windSpeedMps: 0,
  morphRate: 0,
  lifeEnabled: false,
  lifeBirth: 2,
  lifeGrow: 32,
  lifeDecay: 60,
  lifeDeath: 90,
  lifePeak: 1,
  lifeStart: 0,
} as const;
const GENUS_PLACEMENT_DEFAULTS: Record<CloudGenus, { baseKm: number; thicknessKm: number; halfExtentM: number }> = {
  cumulus: { baseKm: 1, thicknessKm: 1.5, halfExtentM: 800 },
  stratus: { baseKm: 0.3, thicknessKm: 1.2, halfExtentM: 5000 },
  stratocumulus: { baseKm: 0.6, thicknessKm: 1.4, halfExtentM: 3000 },
  cumulonimbus: { baseKm: 0.5, thicknessKm: 11.5, halfExtentM: 3000 },
  altocumulus: { baseKm: 2.5, thicknessKm: 2.5, halfExtentM: 1500 },
  altostratus: { baseKm: 2, thicknessKm: 3, halfExtentM: 8000 },
  nimbostratus: { baseKm: 1, thicknessKm: 3, halfExtentM: 10000 },
  cirrus: { baseKm: 7, thicknessKm: 5, halfExtentM: 4000 },
  cirrostratus: { baseKm: 6, thicknessKm: 5, halfExtentM: 12000 },
  cirrocumulus: { baseKm: 6, thicknessKm: 4, halfExtentM: 2000 },
};
const SNAPSHOT_NUMBER_FIELDS = [
  'cumulusDevelopment',
  'baseKm',
  'topKm',
  'densityScale',
  'detailAmount',
  'coverage',
  'centerX',
  'centerZ',
  'radiusX',
  'radiusZ',
  'rotationDeg',
  'feather',
  'windDeg',
  'windSpeedMps',
  'morphRate',
  'lifeBirth',
  'lifeGrow',
  'lifeDecay',
  'lifeDeath',
  'lifePeak',
  'lifeStart',
] as const satisfies readonly (keyof CloudBodySnapshot)[];
const MORPHOLOGY_NUMBER_FIELDS = [
  'verticalDevelopment',
  'cellScale',
  'cellStrength',
  'sheetUniformity',
  'fiberStrength',
  'fiberAngleDeg',
  'anvilStrength',
  'erosionScale',
] as const satisfies readonly (keyof CloudMorphologyRecipe)[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseCloudMorphologyRecipe(value: unknown, bodyId: string): CloudMorphologyRecipe {
  if (!isRecord(value)) throw new Error(`Cloud body ${bodyId} has an invalid morphology recipe.`);
  for (const field of MORPHOLOGY_NUMBER_FIELDS) {
    if (typeof value[field] !== 'number' || !Number.isFinite(value[field])) {
      throw new Error(`Cloud body ${bodyId} has an invalid morphology.${field} value.`);
    }
  }
  return { ...value } as unknown as CloudMorphologyRecipe;
}

function parseCloudBodySnapshot(value: unknown): CloudBodySnapshot {
  if (!isRecord(value)) throw new Error('Cloud body must be an object.');
  if (typeof value.id !== 'string' || value.id.trim() === '') throw new Error('Cloud body id must be a non-empty string.');
  if (typeof value.path !== 'string' || !(CLOUD_BODY_PATHS as readonly string[]).includes(value.path)) {
    throw new Error(`Cloud body ${value.id} has an unsupported render path.`);
  }
  if (typeof value.genus !== 'string' || !isCloudGenus(value.genus)) {
    throw new Error(`Cloud body ${value.id} has an unsupported genus.`);
  }
  if (value.path === 'high-sheet' && !isHighCloudGenus(value.genus)) {
    throw new Error(`High-sheet cloud ${value.id} must use a supported high-cloud genus.`);
  }
  if (typeof value.placementLocked !== 'boolean') {
    throw new Error(`Cloud body ${value.id} has an invalid placementLocked flag.`);
  }
  if (typeof value.bounded !== 'boolean') throw new Error(`Cloud body ${value.id} has an invalid bounded flag.`);
  if (typeof value.lifeEnabled !== 'boolean') throw new Error(`Cloud body ${value.id} has an invalid lifeEnabled flag.`);
  for (const field of SNAPSHOT_NUMBER_FIELDS) {
    if (typeof value[field] !== 'number' || !Number.isFinite(value[field])) {
      throw new Error(`Cloud body ${value.id} has an invalid ${field} value.`);
    }
  }
  const morphology = parseCloudMorphologyRecipe(value.morphology, value.id);
  return { ...value, morphology } as unknown as CloudBodySnapshot;
}

export function parseCloudBodyCollectionSnapshot(value: unknown): CloudBodyCollectionSnapshot {
  if (!isRecord(value) || !Array.isArray(value.bodies)) {
    throw new Error('Unsupported cloud-body collection snapshot.');
  }
  const version = value.version;
  if (version !== 1 && version !== 2 && version !== 3) {
    throw new Error('Unsupported cloud-body collection snapshot.');
  }
  const bodies = value.bodies.map((body) => {
    if (!isRecord(body)) return parseCloudBodySnapshot(body);
    const runtimeBody = version === 1 ? { ...LEGACY_RUNTIME_DEFAULTS, ...body } : body;
    const migratedBody = version <= 2
      ? {
        ...runtimeBody,
        morphology: createCloudMorphologyRecipe(
          typeof runtimeBody.genus === 'string' && isCloudGenus(runtimeBody.genus)
            ? runtimeBody.genus
            : 'cumulus',
        ),
      }
      : runtimeBody;
    return parseCloudBodySnapshot(migratedBody);
  });
  const ids = new Set<string>();
  const pathCounts: Record<CloudBodyPath, number> = { volume: 0, 'local-volume': 0, 'high-sheet': 0 };
  for (const body of bodies) {
    if (ids.has(body.id)) throw new Error(`Duplicate cloud body id: ${body.id}`);
    ids.add(body.id);
    pathCounts[body.path]++;
  }
  if (pathCounts.volume > MAX_VOLUME_CLOUD_BODIES || pathCounts['local-volume'] > 1 || pathCounts['high-sheet'] > 1) {
    throw new Error('Cloud-body collection exceeds renderer capacity.');
  }
  return { version: 3, bodies };
}

export type CloudBodySeed = Omit<CloudBodySnapshot, 'id' | 'morphology'> & {
  morphology?: CloudMorphologyRecipe;
};

const PATH_CAPACITY: Record<CloudBodyPath, number> = {
  volume: MAX_VOLUME_CLOUD_BODIES,
  'local-volume': 1,
  'high-sheet': 1,
};

const DEFAULT_BODY_BOUNDS = {
  coverage: 1,
  bounded: false,
  centerX: 0,
  centerZ: 0,
  radiusX: 20000,
  radiusZ: 15000,
  rotationDeg: 0,
  feather: 0.25,
  placementLocked: true,
  ...LEGACY_RUNTIME_DEFAULTS,
} as const;

const DEFAULT_VOLUME_BODY_SEEDS: readonly CloudBodySeed[] = [
  { ...DEFAULT_BODY_BOUNDS, path: 'volume', genus: 'cumulus', cumulusDevelopment: 0.5, baseKm: 0.4, topKm: 2.8, densityScale: 0.85, detailAmount: 1.0 },
  { ...DEFAULT_BODY_BOUNDS, path: 'volume', genus: 'altocumulus', cumulusDevelopment: 0, baseKm: 3.0, topKm: 5.5, densityScale: 0.28, detailAmount: 0.4 },
  { ...DEFAULT_BODY_BOUNDS, path: 'volume', genus: 'cirrus', cumulusDevelopment: 0, baseKm: 7.0, topKm: 9.0, densityScale: 0.25, detailAmount: 0.0 },
  { ...DEFAULT_BODY_BOUNDS, path: 'volume', genus: 'cumulus', cumulusDevelopment: 0, baseKm: 0.8, topKm: 2.4, densityScale: 0.7, detailAmount: 0.9 },
  { ...DEFAULT_BODY_BOUNDS, path: 'volume', genus: 'stratocumulus', cumulusDevelopment: 0, baseKm: 1.0, topKm: 2.2, densityScale: 0.45, detailAmount: 0.6 },
  { ...DEFAULT_BODY_BOUNDS, path: 'volume', genus: 'altostratus', cumulusDevelopment: 0, baseKm: 3.5, topKm: 6.0, densityScale: 0.22, detailAmount: 0.3 },
  { ...DEFAULT_BODY_BOUNDS, path: 'volume', genus: 'cirrostratus', cumulusDevelopment: 0, baseKm: 7.5, topKm: 10.0, densityScale: 0.18, detailAmount: 0.15 },
  { ...DEFAULT_BODY_BOUNDS, path: 'volume', genus: 'cumulonimbus', cumulusDevelopment: 0, baseKm: 0.7, topKm: 9.0, densityScale: 0.8, detailAmount: 1.2 },
];

const DEFAULT_LOCAL_VOLUME_BODY_SEED: CloudBodySeed = {
  ...DEFAULT_BODY_BOUNDS,
  path: 'local-volume',
  genus: 'cumulonimbus',
  cumulusDevelopment: 0,
  baseKm: 0.7,
  topKm: 9.2,
  densityScale: 1.35,
  detailAmount: 0.42,
  coverage: 0.9,
  bounded: true,
  centerZ: -2000,
  radiusX: 1800,
  radiusZ: 1600,
};

const DEFAULT_HIGH_SHEET_BODY_SEED: CloudBodySeed = {
  ...DEFAULT_BODY_BOUNDS,
  path: 'high-sheet',
  genus: 'altocumulus',
  cumulusDevelopment: 0,
  baseKm: 6.5,
  topKm: 10.5,
  densityScale: 0.06,
  detailAmount: 0.28,
  bounded: false,
  radiusX: 0,
  radiusZ: 0,
};

function defaultBodySeed(path: CloudBodyPath, volumeIndex = 0): CloudBodySeed {
  const seed = path === 'volume'
    ? DEFAULT_VOLUME_BODY_SEEDS[Math.min(volumeIndex, DEFAULT_VOLUME_BODY_SEEDS.length - 1)]
    : path === 'local-volume'
      ? DEFAULT_LOCAL_VOLUME_BODY_SEED
      : DEFAULT_HIGH_SHEET_BODY_SEED;
  return {
    ...seed,
    morphology: seed.morphology ? { ...seed.morphology } : undefined,
  };
}

/** Independent authoring entity consumed directly by the GUI, gizmo and renderer. */
export class CloudBody {
  private suppressPlacementLock = false;
  private genusValue: CloudGenus = 'cumulus';
  private placementIsLocked = true;
  private baseKmValue = 1;
  private topKmValue = 2.5;
  private centerXValue = 0;
  private centerZValue = 0;
  private radiusXValue = 1000;
  private radiusZValue = 1000;
  private boundedValue = false;
  private rotationDegValue = 0;
  private featherValue = 0.25;
  private lifeEnabledValue = false;

  enabled = true;
  cumulusDevelopment = 0;
  densityScale = 1;
  detailAmount = 0.4;
  coverage = 1;
  windDeg: number = LEGACY_RUNTIME_DEFAULTS.windDeg;
  windSpeedMps: number = LEGACY_RUNTIME_DEFAULTS.windSpeedMps;
  morphRate: number = LEGACY_RUNTIME_DEFAULTS.morphRate;
  lifeBirth: number = LEGACY_RUNTIME_DEFAULTS.lifeBirth;
  lifeGrow: number = LEGACY_RUNTIME_DEFAULTS.lifeGrow;
  lifeDecay: number = LEGACY_RUNTIME_DEFAULTS.lifeDecay;
  lifeDeath: number = LEGACY_RUNTIME_DEFAULTS.lifeDeath;
  lifePeak: number = LEGACY_RUNTIME_DEFAULTS.lifePeak;
  lifeStart: number = LEGACY_RUNTIME_DEFAULTS.lifeStart;
  morphology: CloudMorphologyRecipe = createCloudMorphologyRecipe('cumulus');
  readonly id: string;
  readonly path: CloudBodyPath;

  constructor(
    snapshot: CloudBodySnapshot,
    private readonly currentSceneTime: () => number = () => 0,
  ) {
    this.id = snapshot.id;
    this.path = snapshot.path;
    this.applySnapshot(snapshot);
  }

  get genus(): CloudGenus {
    return this.genusValue;
  }

  set genus(value: CloudGenus) {
    if (this.isHighSheet && !isHighCloudGenus(value)) return;
    const changed = this.genusValue !== value;
    this.genusValue = value;
    if (changed) this.morphology = createCloudMorphologyRecipe(value);
    if (changed && !this.placementLocked) this.applyGenusDefaults();
  }

  get placementLocked(): boolean {
    return this.placementIsLocked;
  }

  set placementLocked(value: boolean) {
    this.placementIsLocked = value;
  }

  get baseKm(): number {
    return this.baseKmValue;
  }

  set baseKm(value: number) {
    this.baseKmValue = value;
    this.markPlacementChanged();
  }

  get topKm(): number {
    return this.topKmValue;
  }

  set topKm(value: number) {
    this.topKmValue = this.isLocal ? Math.max(this.baseKm + 0.1, value) : value;
    this.markPlacementChanged();
  }

  get centerX(): number {
    return this.centerXValue;
  }

  set centerX(value: number) {
    this.centerXValue = value;
    this.markPlacementChanged();
  }

  get centerZ(): number {
    return this.centerZValue;
  }

  set centerZ(value: number) {
    this.centerZValue = value;
    this.markPlacementChanged();
  }

  get radiusX(): number {
    return this.radiusXValue;
  }

  set radiusX(value: number) {
    this.radiusXValue = value;
    this.markPlacementChanged();
  }

  get radiusZ(): number {
    return this.radiusZValue;
  }

  set radiusZ(value: number) {
    this.radiusZValue = value;
    this.markPlacementChanged();
  }

  get bounded(): boolean {
    return this.isLocal || this.boundedValue;
  }

  set bounded(value: boolean) {
    if (this.canToggleBounds) this.boundedValue = value;
    this.markPlacementChanged();
  }

  get rotationDeg(): number {
    return this.rotationDegValue;
  }

  set rotationDeg(value: number) {
    if (this.canToggleBounds) this.rotationDegValue = value;
    this.markPlacementChanged();
  }

  get feather(): number {
    return this.featherValue;
  }

  set feather(value: number) {
    if (this.canToggleBounds) this.featherValue = value;
    this.markPlacementChanged();
  }

  get isLocal(): boolean {
    return this.path === 'local-volume';
  }

  get supportsBounds(): boolean {
    return !this.isHighSheet;
  }

  get canToggleBounds(): boolean {
    return this.path === 'volume';
  }

  get hasSpatialBounds(): boolean {
    return this.isLocal || (this.path === 'volume' && this.bounded);
  }

  get isHighSheet(): boolean {
    return this.path === 'high-sheet';
  }

  get supportsRuntimeControls(): boolean {
    return this.path === 'volume';
  }

  get lifeEnabled(): boolean {
    return this.lifeEnabledValue;
  }

  set lifeEnabled(value: boolean) {
    if (!this.supportsRuntimeControls) return;
    if (value && !this.lifeEnabledValue) this.lifeStart = this.currentSceneTime();
    this.lifeEnabledValue = value;
  }

  toSnapshot(): CloudBodySnapshot {
    return {
      id: this.id,
      path: this.path,
      genus: this.genus,
      placementLocked: this.placementLocked,
      cumulusDevelopment: this.cumulusDevelopment,
      baseKm: this.baseKm,
      topKm: this.topKm,
      densityScale: this.densityScale,
      detailAmount: this.detailAmount,
      coverage: this.coverage,
      bounded: this.bounded,
      centerX: this.centerX,
      centerZ: this.centerZ,
      radiusX: this.radiusX,
      radiusZ: this.radiusZ,
      rotationDeg: this.rotationDeg,
      feather: this.feather,
      windDeg: this.windDeg,
      windSpeedMps: this.windSpeedMps,
      morphRate: this.morphRate,
      lifeEnabled: this.lifeEnabled,
      lifeBirth: this.lifeBirth,
      lifeGrow: this.lifeGrow,
      lifeDecay: this.lifeDecay,
      lifeDeath: this.lifeDeath,
      lifePeak: this.lifePeak,
      lifeStart: this.lifeStart,
      morphology: { ...this.morphology },
    };
  }

  applySnapshot(snapshot: CloudBodySnapshot): void {
    if (snapshot.path !== this.path) throw new Error(`Cloud body ${this.id} cannot change render path.`);
    this.withoutPlacementLock(() => {
      this.genus = snapshot.genus;
      this.cumulusDevelopment = snapshot.cumulusDevelopment;
      this.baseKm = snapshot.baseKm;
      this.topKm = snapshot.topKm;
      this.densityScale = snapshot.densityScale;
      this.detailAmount = snapshot.detailAmount;
      this.coverage = snapshot.coverage;
      this.bounded = snapshot.bounded;
      this.centerX = snapshot.centerX;
      this.centerZ = snapshot.centerZ;
      this.radiusX = snapshot.radiusX;
      this.radiusZ = snapshot.radiusZ;
      this.rotationDeg = snapshot.rotationDeg;
      this.feather = snapshot.feather;
      this.windDeg = snapshot.windDeg;
      this.windSpeedMps = snapshot.windSpeedMps;
      this.morphRate = snapshot.morphRate;
      this.lifeEnabled = snapshot.lifeEnabled;
      this.lifeBirth = snapshot.lifeBirth;
      this.lifeGrow = snapshot.lifeGrow;
      this.lifeDecay = snapshot.lifeDecay;
      this.lifeDeath = snapshot.lifeDeath;
      this.lifePeak = snapshot.lifePeak;
      this.lifeStart = snapshot.lifeStart;
      this.morphology = { ...snapshot.morphology };
    });
    this.placementLocked = snapshot.placementLocked;
  }

  applyGenusDefaults(): void {
    const defaults = GENUS_PLACEMENT_DEFAULTS[this.genus];
    this.withoutPlacementLock(() => {
      this.baseKm = defaults.baseKm;
      this.topKm = defaults.baseKm + defaults.thicknessKm;
      if (this.supportsBounds) {
        this.radiusX = defaults.halfExtentM;
        this.radiusZ = defaults.halfExtentM;
      }
    });
    this.placementLocked = false;
  }

  copyTo(target: CloudBody): void {
    target.withoutPlacementLock(() => {
      target.genus = this.genus;
      target.cumulusDevelopment = this.cumulusDevelopment;
      target.baseKm = this.baseKm;
      target.topKm = this.topKm;
      target.densityScale = this.densityScale;
      if (!target.isLocal) target.detailAmount = this.detailAmount;
      if (target.canToggleBounds) {
        target.bounded = this.supportsBounds ? this.bounded : false;
        if (this.supportsBounds) {
          target.centerX = this.centerX;
          target.centerZ = this.centerZ;
          target.radiusX = this.radiusX;
          target.radiusZ = this.radiusZ;
          target.rotationDeg = this.rotationDeg;
          target.feather = this.feather;
        }
      }
      if (target.isLocal) {
        target.coverage = this.isLocal ? this.coverage : 0.75;
        target.centerX = this.supportsBounds ? this.centerX : 0;
        target.centerZ = this.supportsBounds ? this.centerZ : -2000;
        target.radiusX = this.hasSpatialBounds ? this.radiusX : 1800;
        target.radiusZ = this.hasSpatialBounds ? this.radiusZ : 1600;
      }
      if (target.supportsRuntimeControls) {
        target.windDeg = this.supportsRuntimeControls ? this.windDeg : 35;
        target.windSpeedMps = this.supportsRuntimeControls ? this.windSpeedMps : 0;
        target.morphRate = this.supportsRuntimeControls ? this.morphRate : 0;
        target.lifeEnabled = this.supportsRuntimeControls ? this.lifeEnabled : false;
        target.lifeBirth = this.supportsRuntimeControls ? this.lifeBirth : 2;
        target.lifeGrow = this.supportsRuntimeControls ? this.lifeGrow : 32;
        target.lifeDecay = this.supportsRuntimeControls ? this.lifeDecay : 60;
        target.lifeDeath = this.supportsRuntimeControls ? this.lifeDeath : 90;
        target.lifePeak = this.supportsRuntimeControls ? this.lifePeak : 1;
        target.lifeStart = this.supportsRuntimeControls ? this.lifeStart : 0;
      }
      target.morphology = { ...this.morphology };
    });
    target.placementLocked = this.placementLocked;
    target.enabled = true;
  }

  private markPlacementChanged(): void {
    if (!this.suppressPlacementLock) this.placementLocked = true;
  }

  private withoutPlacementLock(update: () => void): void {
    const previous = this.suppressPlacementLock;
    this.suppressPlacementLock = true;
    try {
      update();
    } finally {
      this.suppressPlacementLock = previous;
    }
  }
}

export class CloudBodyStore {
  private bodyList: CloudBody[] = [];
  private nextBodyNumber = 1;

  constructor(private readonly currentSceneTime: () => number = () => 0) {}

  static createDefault(currentSceneTime: () => number = () => 0): CloudBodyStore {
    const store = new CloudBodyStore(currentSceneTime);
    store.reset();
    return store;
  }

  get bodies(): readonly CloudBody[] {
    return this.bodyList;
  }

  active(): CloudBody[] {
    return [...this.bodyList];
  }

  find(id: string): CloudBody | undefined {
    return this.bodyList.find((body) => body.id === id);
  }

  reset(primaryGenus: CloudGenus = 'cumulus', cumulusDevelopment = 0.5): CloudBody {
    this.bodyList = [];
    const primary = this.createDefaultBody('volume');
    primary.placementLocked = false;
    primary.genus = primaryGenus;
    primary.applyGenusDefaults();
    primary.cumulusDevelopment = cumulusDevelopment;
    primary.placementLocked = true;
    this.bodyList.push(primary);
    return primary;
  }

  canAdd(): boolean {
    return this.findAvailablePath(['volume', 'local-volume', 'high-sheet']) !== undefined;
  }

  add(requestedPath?: CloudBodyPath, placementLocked = false): CloudBody | undefined {
    const path = requestedPath ?? this.findAvailablePath(['volume', 'local-volume', 'high-sheet']);
    if (requestedPath && !this.findAvailablePath([requestedPath])) return undefined;
    if (!path) return undefined;
    const target = this.createDefaultBody(path);
    target.placementLocked = placementLocked;
    this.bodyList.push(target);
    return target;
  }

  canDuplicate(id: string): boolean {
    const source = this.find(id);
    if (!source || source.isHighSheet) return false;
    return this.findAvailablePath(['volume', 'local-volume']) !== undefined;
  }

  duplicate(id: string): CloudBody | undefined {
    const source = this.find(id);
    if (!source || source.isHighSheet) return undefined;
    const path = this.findAvailablePath(['volume', 'local-volume']);
    if (!path) return undefined;
    const target = this.createDefaultBody(path);
    source.copyTo(target);
    this.bodyList.push(target);
    return target;
  }

  remove(id: string): boolean {
    const index = this.bodyList.findIndex((body) => body.id === id);
    if (index < 0) return false;
    const body = this.bodyList[index];
    body.enabled = false;
    this.bodyList.splice(index, 1);
    return true;
  }

  exportSnapshot(): CloudBodyCollectionSnapshot {
    return {
      version: 3,
      bodies: this.bodyList.map((body) => body.toSnapshot()),
    };
  }

  restoreSnapshot(value: unknown): void {
    const snapshot = parseCloudBodyCollectionSnapshot(value);

    this.bodyList = [];
    for (const bodySnapshot of snapshot.bodies) {
      if (!this.findAvailablePath([bodySnapshot.path])) {
        throw new Error(`No renderer path is available for cloud body ${bodySnapshot.id}.`);
      }
      const body = new CloudBody(bodySnapshot, this.currentSceneTime);
      this.bodyList.push(body);
    }
  }

  get activeCount(): number {
    return this.active().length;
  }

  get capacity(): number {
    return MAX_VOLUME_CLOUD_BODIES + 2;
  }

  private allocateId(): string {
    let id = `cloud-${this.nextBodyNumber++}`;
    while (this.bodyList.some((body) => body.id === id)) id = `cloud-${this.nextBodyNumber++}`;
    return id;
  }

  private createDefaultBody(path: CloudBodyPath): CloudBody {
    const volumeIndex = this.bodyList.filter((body) => body.path === 'volume').length;
    const data = defaultBodySeed(path, volumeIndex);
    const id = this.allocateId();
    return new CloudBody({
      id,
      ...data,
      morphology: data.morphology ?? createCloudMorphologyRecipe(data.genus),
    }, this.currentSceneTime);
  }

  private findAvailablePath(pathOrder: readonly CloudBodyPath[]): CloudBodyPath | undefined {
    for (const path of pathOrder) {
      if (this.bodyList.filter((body) => body.path === path).length < PATH_CAPACITY[path]) return path;
    }
    return undefined;
  }
}
