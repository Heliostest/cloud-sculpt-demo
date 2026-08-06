import {
  createDefaultParams,
  isCloudGenus,
  isHighCloudGenus,
  MAX_VOLUME_CLOUD_BODIES,
  type CloudGenus,
  type DemoParams,
} from './params';

export type CloudBodyPath = 'volume' | 'local-volume' | 'high-sheet';

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
}

export interface CloudBodyCollectionSnapshot {
  version: 1;
  bodies: CloudBodySnapshot[];
}

const CLOUD_BODY_PATHS = ['volume', 'local-volume', 'high-sheet'] as const;
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
] as const satisfies readonly (keyof CloudBodySnapshot)[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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
  for (const field of SNAPSHOT_NUMBER_FIELDS) {
    if (typeof value[field] !== 'number' || !Number.isFinite(value[field])) {
      throw new Error(`Cloud body ${value.id} has an invalid ${field} value.`);
    }
  }
  return value as unknown as CloudBodySnapshot;
}

export function parseCloudBodyCollectionSnapshot(value: unknown): CloudBodyCollectionSnapshot {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.bodies)) {
    throw new Error('Unsupported cloud-body collection snapshot.');
  }
  const bodies = value.bodies.map(parseCloudBodySnapshot);
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
  return { version: 1, bodies };
}

type CloudBodySlot =
  | { kind: 'layer'; index: number }
  | { kind: 'hero' }
  | { kind: 'high' };

function cloudBodySlotKey(slot: CloudBodySlot): string {
  return slot.kind === 'layer' ? `layer-${slot.index}` : slot.kind;
}

const BODY_SLOTS: readonly CloudBodySlot[] = [
  ...Array.from({ length: MAX_VOLUME_CLOUD_BODIES }, (_, index) => ({ kind: 'layer' as const, index })),
  { kind: 'hero' },
  { kind: 'high' },
];

/**
 * Object-oriented view over the current fixed renderer slots.
 *
 * The renderer still consumes DemoParams directly. Keeping this class as a
 * live adapter lets the editor move to cloud objects without changing shader
 * output in the same step.
 */
export class CloudBody {
  private suppressPlacementLock = false;

  constructor(
    private readonly params: DemoParams,
    private readonly slot: CloudBodySlot,
    readonly id: string,
    private placementIsLocked = true,
  ) {}

  get rendererSlot(): string {
    return cloudBodySlotKey(this.slot);
  }

  get path(): CloudBodyPath {
    if (this.slot.kind === 'hero') return 'local-volume';
    if (this.slot.kind === 'high') return 'high-sheet';
    return 'volume';
  }

  get enabled(): boolean {
    if (this.slot.kind === 'layer') return this.params.layers[this.slot.index].enabled;
    if (this.slot.kind === 'hero') return this.params.hero.enabled;
    return this.params.highCloudEnabled;
  }

  set enabled(value: boolean) {
    if (this.slot.kind === 'layer') this.params.layers[this.slot.index].enabled = value;
    else if (this.slot.kind === 'hero') this.params.hero.enabled = value;
    else this.params.highCloudEnabled = value;
  }

  get genus(): CloudGenus {
    if (this.slot.kind === 'layer') return this.params.layers[this.slot.index].genus;
    if (this.slot.kind === 'hero') return this.params.hero.genus;
    return this.params.highCloudGenus;
  }

  set genus(value: CloudGenus) {
    const previous = this.genus;
    if (this.slot.kind === 'layer') this.params.layers[this.slot.index].genus = value;
    else if (this.slot.kind === 'hero') this.params.hero.genus = value;
    else if (isHighCloudGenus(value)) this.params.highCloudGenus = value;
    if (this.genus !== previous && !this.placementLocked) this.applyGenusDefaults();
  }

  get placementLocked(): boolean {
    return this.placementIsLocked;
  }

  set placementLocked(value: boolean) {
    this.placementIsLocked = value;
  }

  get cumulusDevelopment(): number {
    if (this.slot.kind === 'layer') return this.params.layers[this.slot.index].cumulusDevelopment;
    if (this.slot.kind === 'hero') return this.params.hero.cumulusDevelopment;
    return 0;
  }

  set cumulusDevelopment(value: number) {
    if (this.slot.kind === 'layer') this.params.layers[this.slot.index].cumulusDevelopment = value;
    else if (this.slot.kind === 'hero') this.params.hero.cumulusDevelopment = value;
  }

  get baseKm(): number {
    if (this.slot.kind === 'layer') return this.params.layers[this.slot.index].baseKm;
    if (this.slot.kind === 'hero') return this.params.hero.baseKm;
    return this.params.highBaseKm;
  }

  set baseKm(value: number) {
    if (this.slot.kind === 'layer') this.params.layers[this.slot.index].baseKm = value;
    else if (this.slot.kind === 'hero') this.params.hero.baseKm = value;
    else this.params.highBaseKm = value;
    this.markPlacementChanged();
  }

  get topKm(): number {
    if (this.slot.kind === 'layer') return this.params.layers[this.slot.index].topKm;
    if (this.slot.kind === 'hero') return this.params.hero.baseKm + this.params.hero.thicknessKm;
    return this.params.highTopKm;
  }

  set topKm(value: number) {
    if (this.slot.kind === 'layer') this.params.layers[this.slot.index].topKm = value;
    else if (this.slot.kind === 'hero') this.params.hero.thicknessKm = Math.max(0.1, value - this.params.hero.baseKm);
    else this.params.highTopKm = value;
    this.markPlacementChanged();
  }

  get densityScale(): number {
    if (this.slot.kind === 'layer') return this.params.layers[this.slot.index].densityScale;
    if (this.slot.kind === 'hero') return this.params.hero.densityMul;
    return this.params.highDensityMultiplier;
  }

  set densityScale(value: number) {
    if (this.slot.kind === 'layer') this.params.layers[this.slot.index].densityScale = value;
    else if (this.slot.kind === 'hero') this.params.hero.densityMul = value;
    else this.params.highDensityMultiplier = value;
  }

  get detailAmount(): number {
    if (this.slot.kind === 'layer') return this.params.layers[this.slot.index].detailAmount;
    if (this.slot.kind === 'high') return this.params.highWispStrength;
    return this.params.detailStrength;
  }

  set detailAmount(value: number) {
    if (this.slot.kind === 'layer') this.params.layers[this.slot.index].detailAmount = value;
    else if (this.slot.kind === 'high') this.params.highWispStrength = value;
    else this.params.detailStrength = value;
  }

  get coverage(): number {
    return this.slot.kind === 'hero' ? this.params.hero.coverage : this.params.loCovCoverIntensity;
  }

  set coverage(value: number) {
    if (this.slot.kind === 'hero') this.params.hero.coverage = value;
    else this.params.loCovCoverIntensity = value;
  }

  get centerX(): number {
    if (this.slot.kind === 'layer') return this.params.layers[this.slot.index].centerX;
    return this.slot.kind === 'hero' ? this.params.hero.cx : 0;
  }

  set centerX(value: number) {
    if (this.slot.kind === 'layer') this.params.layers[this.slot.index].centerX = value;
    else if (this.slot.kind === 'hero') this.params.hero.cx = value;
    this.markPlacementChanged();
  }

  get centerZ(): number {
    if (this.slot.kind === 'layer') return this.params.layers[this.slot.index].centerZ;
    return this.slot.kind === 'hero' ? this.params.hero.cz : 0;
  }

  set centerZ(value: number) {
    if (this.slot.kind === 'layer') this.params.layers[this.slot.index].centerZ = value;
    else if (this.slot.kind === 'hero') this.params.hero.cz = value;
    this.markPlacementChanged();
  }

  get radiusX(): number {
    if (this.slot.kind === 'layer') return this.params.layers[this.slot.index].radiusX;
    return this.slot.kind === 'hero' ? this.params.hero.rx : 0;
  }

  set radiusX(value: number) {
    if (this.slot.kind === 'layer') this.params.layers[this.slot.index].radiusX = value;
    else if (this.slot.kind === 'hero') this.params.hero.rx = value;
    this.markPlacementChanged();
  }

  get radiusZ(): number {
    if (this.slot.kind === 'layer') return this.params.layers[this.slot.index].radiusZ;
    return this.slot.kind === 'hero' ? this.params.hero.rz : 0;
  }

  set radiusZ(value: number) {
    if (this.slot.kind === 'layer') this.params.layers[this.slot.index].radiusZ = value;
    else if (this.slot.kind === 'hero') this.params.hero.rz = value;
    this.markPlacementChanged();
  }

  get bounded(): boolean {
    if (this.slot.kind === 'layer') return this.params.layers[this.slot.index].bounded;
    return this.slot.kind === 'hero';
  }

  set bounded(value: boolean) {
    if (this.slot.kind === 'layer') this.params.layers[this.slot.index].bounded = value;
    this.markPlacementChanged();
  }

  get rotationDeg(): number {
    return this.slot.kind === 'layer' ? this.params.layers[this.slot.index].rotationDeg : 0;
  }

  set rotationDeg(value: number) {
    if (this.slot.kind === 'layer') this.params.layers[this.slot.index].rotationDeg = value;
    this.markPlacementChanged();
  }

  get feather(): number {
    return this.slot.kind === 'layer' ? this.params.layers[this.slot.index].feather : 0.25;
  }

  set feather(value: number) {
    if (this.slot.kind === 'layer') this.params.layers[this.slot.index].feather = value;
    this.markPlacementChanged();
  }

  get isLocal(): boolean {
    return this.slot.kind === 'hero';
  }

  get supportsBounds(): boolean {
    return this.slot.kind !== 'high';
  }

  get canToggleBounds(): boolean {
    return this.slot.kind === 'layer';
  }

  get hasSpatialBounds(): boolean {
    return this.slot.kind === 'hero' || (this.slot.kind === 'layer' && this.bounded);
  }

  get isHighSheet(): boolean {
    return this.slot.kind === 'high';
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
    };
  }

  applySnapshot(snapshot: CloudBodySnapshot): void {
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

  constructor(private readonly params: DemoParams) {
    this.reloadFromParams();
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

  /**
   * Reconciles the authoring collection after legacy code (notably presets)
   * has changed the renderer parameters directly. Existing bodies keep their
   * stable editor identity as long as their renderer slot remains active.
   */
  reloadFromParams(): void {
    const previousBySlot = new Map(this.bodyList.map((body) => [body.rendererSlot, body]));
    this.bodyList = BODY_SLOTS.flatMap((slot) => {
      const probe = new CloudBody(this.params, slot, 'probe');
      if (!probe.enabled) return [];
      return [previousBySlot.get(probe.rendererSlot) ?? this.createBody(slot)];
    });
  }

  canAdd(): boolean {
    return this.bodyList.length < BODY_SLOTS.length;
  }

  add(): CloudBody | undefined {
    const slot = this.findAvailableSlot(['volume', 'local-volume', 'high-sheet']);
    if (!slot) return undefined;

    const target = this.createBody(slot);
    const defaults = new CloudBody(createDefaultParams(), slot, 'defaults');
    defaults.copyTo(target);
    target.placementLocked = false;
    target.enabled = true;
    this.bodyList.push(target);
    return target;
  }

  canDuplicate(id: string): boolean {
    const source = this.find(id);
    if (!source || source.isHighSheet) return false;
    return this.findAvailableSlot(['volume', 'local-volume']) !== undefined;
  }

  duplicate(id: string): CloudBody | undefined {
    const source = this.find(id);
    if (!source || source.isHighSheet) return undefined;
    const slot = this.findAvailableSlot(['volume', 'local-volume']);
    if (!slot) return undefined;
    const target = this.createBody(slot);
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
      version: 1,
      bodies: this.bodyList.map((body) => body.toSnapshot()),
    };
  }

  restoreSnapshot(value: unknown): void {
    const snapshot = parseCloudBodyCollectionSnapshot(value);

    for (const slot of BODY_SLOTS) new CloudBody(this.params, slot, 'reset').enabled = false;
    this.bodyList = [];
    for (const bodySnapshot of snapshot.bodies) {
      const slot = this.findAvailableSlot([bodySnapshot.path]);
      if (!slot) throw new Error(`No renderer slot is available for cloud body ${bodySnapshot.id}.`);
      const body = new CloudBody(this.params, slot, bodySnapshot.id);
      body.applySnapshot(bodySnapshot);
      body.enabled = true;
      this.bodyList.push(body);
    }
  }

  get activeCount(): number {
    return this.active().length;
  }

  get capacity(): number {
    return BODY_SLOTS.length;
  }

  private createBody(slot: CloudBodySlot): CloudBody {
    let id = `cloud-${this.nextBodyNumber++}`;
    while (this.bodyList.some((body) => body.id === id)) id = `cloud-${this.nextBodyNumber++}`;
    return new CloudBody(this.params, slot, id);
  }

  private findAvailableSlot(pathOrder: readonly CloudBodyPath[]): CloudBodySlot | undefined {
    const usedSlots = new Set(this.bodyList.map((body) => body.rendererSlot));
    for (const path of pathOrder) {
      const slot = BODY_SLOTS.find((candidate) => {
        if (usedSlots.has(cloudBodySlotKey(candidate))) return false;
        return new CloudBody(this.params, candidate, 'probe').path === path;
      });
      if (slot) return slot;
    }
    return undefined;
  }
}
