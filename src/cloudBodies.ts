import {
  createDefaultParams,
  isHighCloudGenus,
  MAX_VOLUME_CLOUD_BODIES,
  type CloudGenus,
  type DemoParams,
} from './params';

export type CloudBodyPath = 'volume' | 'local-volume' | 'high-sheet';

type CloudBodySlot =
  | { kind: 'layer'; index: number }
  | { kind: 'hero' }
  | { kind: 'high' };

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
  constructor(
    private readonly params: DemoParams,
    private readonly slot: CloudBodySlot,
  ) {}

  get id(): string {
    if (this.slot.kind === 'layer') return `body-layer-${this.slot.index}`;
    return `body-${this.slot.kind}`;
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
    if (this.slot.kind === 'layer') this.params.layers[this.slot.index].genus = value;
    else if (this.slot.kind === 'hero') this.params.hero.genus = value;
    else if (isHighCloudGenus(value)) this.params.highCloudGenus = value;
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
    return this.slot.kind === 'hero' ? this.params.hero.cx : 0;
  }

  set centerX(value: number) {
    if (this.slot.kind === 'hero') this.params.hero.cx = value;
  }

  get centerZ(): number {
    return this.slot.kind === 'hero' ? this.params.hero.cz : 0;
  }

  set centerZ(value: number) {
    if (this.slot.kind === 'hero') this.params.hero.cz = value;
  }

  get radiusX(): number {
    return this.slot.kind === 'hero' ? this.params.hero.rx : 0;
  }

  set radiusX(value: number) {
    if (this.slot.kind === 'hero') this.params.hero.rx = value;
  }

  get radiusZ(): number {
    return this.slot.kind === 'hero' ? this.params.hero.rz : 0;
  }

  set radiusZ(value: number) {
    if (this.slot.kind === 'hero') this.params.hero.rz = value;
  }

  get isLocal(): boolean {
    return this.slot.kind === 'hero';
  }

  get isHighSheet(): boolean {
    return this.slot.kind === 'high';
  }

  copyTo(target: CloudBody): void {
    target.genus = this.genus;
    target.cumulusDevelopment = this.cumulusDevelopment;
    target.baseKm = this.baseKm;
    target.topKm = this.topKm;
    target.densityScale = this.densityScale;
    if (!target.isLocal) target.detailAmount = this.detailAmount;
    if (target.isLocal) {
      target.coverage = this.isLocal ? this.coverage : 0.75;
      target.centerX = this.centerX;
      target.centerZ = this.centerZ;
      target.radiusX = this.isLocal ? this.radiusX : 1800;
      target.radiusZ = this.isLocal ? this.radiusZ : 1600;
    }
    target.enabled = true;
  }
}

export class CloudBodyStore {
  readonly bodies: readonly CloudBody[];

  constructor(private readonly params: DemoParams) {
    this.bodies = BODY_SLOTS.map((slot) => new CloudBody(params, slot));
  }

  active(): CloudBody[] {
    return this.bodies.filter((body) => body.enabled);
  }

  find(id: string): CloudBody | undefined {
    return this.bodies.find((body) => body.id === id);
  }

  canAdd(): boolean {
    return this.bodies.some((body) => !body.enabled);
  }

  add(): CloudBody | undefined {
    const target = this.bodies.find((body) => !body.enabled && body.path === 'volume')
      ?? this.bodies.find((body) => !body.enabled && body.path === 'local-volume')
      ?? this.bodies.find((body) => !body.enabled);
    if (!target) return undefined;

    const defaults = new CloudBodyStore(createDefaultParams());
    defaults.find(target.id)?.copyTo(target);
    target.enabled = true;
    return target;
  }

  canDuplicate(id: string): boolean {
    const source = this.find(id);
    if (!source || source.isHighSheet) return false;
    return this.bodies.some((body) => !body.enabled && !body.isHighSheet);
  }

  duplicate(id: string): CloudBody | undefined {
    const source = this.find(id);
    if (!source || source.isHighSheet) return undefined;
    const target = this.bodies.find((body) => !body.enabled && body.path === 'volume')
      ?? this.bodies.find((body) => !body.enabled && body.path === 'local-volume');
    if (!target) return undefined;
    source.copyTo(target);
    return target;
  }

  remove(id: string): boolean {
    const body = this.find(id);
    if (!body) return false;
    body.enabled = false;
    return true;
  }

  get activeCount(): number {
    return this.active().length;
  }

  get capacity(): number {
    return this.bodies.length;
  }
}
