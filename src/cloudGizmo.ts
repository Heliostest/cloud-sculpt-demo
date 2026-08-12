import type { CloudBody } from './cloudBodies';
import { getLang } from './i18n';
import type { CameraState } from './renderer';

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type CloudGizmoHandle = 'center' | 'radiusX' | 'radiusZ' | 'rotation';

interface Viewport {
  width: number;
  height: number;
}

interface CameraBasis {
  forward: Vec3;
  right: Vec3;
  up: Vec3;
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (v: Vec3, amount: number): Vec3 => [v[0] * amount, v[1] * amount, v[2] * amount];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (v: Vec3, fallback: Vec3): Vec3 => {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length > 1e-8 ? [v[0] / length, v[1] / length, v[2] / length] : fallback;
};

export function cameraBasis(camera: CameraState): CameraBasis {
  const forward = normalize(sub(camera.target, camera.position), [0, 0, -1]);
  const right = normalize(cross(forward, [0, 1, 0]), [1, 0, 0]);
  return { forward, right, up: normalize(cross(right, forward), [0, 1, 0]) };
}

export function projectWorldToScreen(
  world: Vec3,
  camera: CameraState,
  viewport: Viewport,
): Vec2 | null {
  const basis = cameraBasis(camera);
  const relative = sub(world, camera.position);
  const depth = dot(relative, basis.forward);
  if (depth <= 1e-3) return null;
  const tanHalfFov = Math.tan(camera.fovY * 0.5);
  const aspect = viewport.width / Math.max(1, viewport.height);
  const ndcX = dot(relative, basis.right) / (depth * tanHalfFov * aspect);
  const ndcY = dot(relative, basis.up) / (depth * tanHalfFov);
  return [(ndcX * 0.5 + 0.5) * viewport.width, (0.5 - ndcY * 0.5) * viewport.height];
}

export function screenPointToRay(
  screen: Vec2,
  camera: CameraState,
  viewport: Viewport,
): { origin: Vec3; direction: Vec3 } {
  const basis = cameraBasis(camera);
  const aspect = viewport.width / Math.max(1, viewport.height);
  const tanHalfFov = Math.tan(camera.fovY * 0.5);
  const ndcX = (screen[0] / Math.max(1, viewport.width)) * 2 - 1;
  const ndcY = 1 - (screen[1] / Math.max(1, viewport.height)) * 2;
  const direction = normalize(add(
    basis.forward,
    add(
      scale(basis.right, ndcX * tanHalfFov * aspect),
      scale(basis.up, ndcY * tanHalfFov),
    ),
  ), basis.forward);
  return { origin: camera.position, direction };
}

export function intersectHorizontalPlane(
  origin: Vec3,
  direction: Vec3,
  planeY: number,
): Vec3 | null {
  if (Math.abs(direction[1]) < 1e-6) return null;
  const distance = (planeY - origin[1]) / direction[1];
  if (distance <= 0) return null;
  return add(origin, scale(direction, distance));
}

export function ellipseWorldPoint(body: CloudBody, angle: number, altitude: number): Vec3 {
  const rotation = body.rotationDeg * Math.PI / 180;
  const localX = Math.cos(angle) * body.radiusX;
  const localZ = Math.sin(angle) * body.radiusZ;
  return [
    body.centerX + Math.cos(rotation) * localX - Math.sin(rotation) * localZ,
    altitude,
    body.centerZ + Math.sin(rotation) * localX + Math.cos(rotation) * localZ,
  ];
}

export function rotationHandleWorldPoint(body: CloudBody, altitude: number): Vec3 {
  const rotation = body.rotationDeg * Math.PI / 180;
  const extension = Math.max(500, Math.min(body.radiusX, body.radiusZ) * 0.25);
  const distance = body.radiusX + extension;
  return [
    body.centerX + Math.cos(rotation) * distance,
    altitude,
    body.centerZ + Math.sin(rotation) * distance,
  ];
}

export function normalizeRotationDegrees(degrees: number): number {
  return ((degrees + 180) % 360 + 360) % 360 - 180;
}

export class CloudGizmo {
  private readonly overlay: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private camera: CameraState | null = null;
  private body: CloudBody | null = null;
  private viewport: Viewport = { width: 1, height: 1 };
  private handles = new Map<CloudGizmoHandle, Vec2>();
  private dragHandle: CloudGizmoHandle | null = null;
  private centerDragOffset: Vec2 = [0, 0];
  private rotationDragOffsetDeg = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onChange: () => void,
  ) {
    this.overlay = document.createElement('canvas');
    this.overlay.className = 'cloud-gizmo-layer';
    this.overlay.setAttribute('aria-hidden', 'true');
    const context = this.overlay.getContext('2d');
    if (!context) throw new Error('2D canvas is unavailable for the cloud gizmo');
    this.context = context;
    document.body.appendChild(this.overlay);
  }

  get isDragging(): boolean {
    return this.dragHandle !== null;
  }

  update(camera: CameraState, body: CloudBody | null): void {
    this.camera = camera;
    this.body = body?.enabled && body.hasSpatialBounds ? body : null;
    this.resizeOverlay();
    this.draw();
  }

  pointerDown(event: PointerEvent): boolean {
    if (!this.body || !this.camera) return false;
    const point = this.eventPoint(event);
    const handle = this.hitHandle(point);
    if (!handle) return false;
    const world = this.worldOnBodyPlane(point);
    if (!world) return false;
    this.dragHandle = handle;
    if (handle === 'center') {
      this.centerDragOffset = [world[0] - this.body.centerX, world[2] - this.body.centerZ];
    } else if (handle === 'rotation') {
      const pointerAngle = Math.atan2(world[2] - this.body.centerZ, world[0] - this.body.centerX) * 180 / Math.PI;
      this.rotationDragOffsetDeg = this.body.rotationDeg - pointerAngle;
    }
    document.body.dataset.gizmoHandle = handle;
    this.canvas.style.cursor = 'grabbing';
    return true;
  }

  pointerMove(event: PointerEvent): boolean {
    const point = this.eventPoint(event);
    if (!this.body || !this.camera || !this.dragHandle) {
      const handle = this.hitHandle(point);
      this.canvas.style.cursor = handle ? 'grab' : '';
      return false;
    }
    const world = this.worldOnBodyPlane(point);
    if (!world) return true;
    if (this.dragHandle === 'center') {
      this.body.centerX = world[0] - this.centerDragOffset[0];
      this.body.centerZ = world[2] - this.centerDragOffset[1];
    } else if (this.dragHandle === 'rotation') {
      const pointerAngle = Math.atan2(world[2] - this.body.centerZ, world[0] - this.body.centerX) * 180 / Math.PI;
      this.body.rotationDeg = normalizeRotationDegrees(pointerAngle + this.rotationDragOffsetDeg);
    } else {
      const rotation = this.body.rotationDeg * Math.PI / 180;
      const dx = world[0] - this.body.centerX;
      const dz = world[2] - this.body.centerZ;
      const localX = Math.cos(rotation) * dx + Math.sin(rotation) * dz;
      const localZ = -Math.sin(rotation) * dx + Math.cos(rotation) * dz;
      if (this.dragHandle === 'radiusX') this.body.radiusX = Math.max(100, Math.abs(localX));
      else this.body.radiusZ = Math.max(100, Math.abs(localZ));
    }
    this.onChange();
    return true;
  }

  pointerUp(): boolean {
    if (!this.dragHandle) return false;
    this.dragHandle = null;
    delete document.body.dataset.gizmoHandle;
    this.canvas.style.cursor = '';
    return true;
  }

  destroy(): void {
    this.overlay.remove();
  }

  private bodyAltitude(): number {
    return this.body ? (this.body.baseKm + this.body.topKm) * 500 : 0;
  }

  private eventPoint(event: PointerEvent): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }

  private worldOnBodyPlane(point: Vec2): Vec3 | null {
    if (!this.camera) return null;
    const ray = screenPointToRay(point, this.camera, this.viewport);
    return intersectHorizontalPlane(ray.origin, ray.direction, this.bodyAltitude());
  }

  private hitHandle(point: Vec2): CloudGizmoHandle | null {
    let nearest: { handle: CloudGizmoHandle; distance: number } | null = null;
    for (const [handle, screen] of this.handles) {
      const distance = Math.hypot(point[0] - screen[0], point[1] - screen[1]);
      if (distance <= 14 && (!nearest || distance < nearest.distance)) nearest = { handle, distance };
    }
    return nearest?.handle ?? null;
  }

  private resizeOverlay(): void {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.viewport = { width, height };
    this.overlay.style.left = `${rect.left}px`;
    this.overlay.style.top = `${rect.top}px`;
    this.overlay.style.width = `${width}px`;
    this.overlay.style.height = `${height}px`;
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (this.overlay.width !== pixelWidth || this.overlay.height !== pixelHeight) {
      this.overlay.width = pixelWidth;
      this.overlay.height = pixelHeight;
    }
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private draw(): void {
    const ctx = this.context;
    ctx.clearRect(0, 0, this.viewport.width, this.viewport.height);
    this.handles.clear();
    const body = this.body;
    const camera = this.camera;
    document.body.dataset.gizmoVisible = String(Boolean(body && camera));
    document.body.dataset.selectedCloudBody = body?.id ?? '';
    if (!body || !camera) {
      delete document.body.dataset.selectedCloudCenter;
      delete document.body.dataset.selectedCloudRadii;
      delete document.body.dataset.selectedCloudRotation;
      return;
    }
    document.body.dataset.selectedCloudCenter = `${body.centerX.toFixed(2)},${body.centerZ.toFixed(2)}`;
    document.body.dataset.selectedCloudRadii = `${body.radiusX.toFixed(2)},${body.radiusZ.toFixed(2)}`;
    document.body.dataset.selectedCloudRotation = body.rotationDeg.toFixed(2);

    const altitude = this.bodyAltitude();
    const outline: Vec2[] = [];
    for (let index = 0; index <= 64; index++) {
      const projected = projectWorldToScreen(
        ellipseWorldPoint(body, index / 64 * Math.PI * 2, altitude),
        camera,
        this.viewport,
      );
      if (projected) outline.push(projected);
    }
    if (outline.length < 3) return;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(outline[0][0], outline[0][1]);
    for (const point of outline.slice(1)) ctx.lineTo(point[0], point[1]);
    ctx.closePath();
    ctx.fillStyle = 'rgba(62, 207, 255, 0.07)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(105, 220, 255, 0.95)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    const center = projectWorldToScreen([body.centerX, altitude, body.centerZ], camera, this.viewport);
    const radiusX = projectWorldToScreen(ellipseWorldPoint(body, 0, altitude), camera, this.viewport);
    const radiusZ = projectWorldToScreen(ellipseWorldPoint(body, Math.PI * 0.5, altitude), camera, this.viewport);
    const rotation = body.canToggleBounds
      ? projectWorldToScreen(rotationHandleWorldPoint(body, altitude), camera, this.viewport)
      : null;
    if (center) this.drawHandle('center', center, '#ffffff', 7);
    if (radiusX) this.drawHandle('radiusX', radiusX, '#44d7ff', 7);
    if (radiusZ) this.drawHandle('radiusZ', radiusZ, '#ffd45c', 7);
    if (rotation) this.drawHandle('rotation', rotation, '#ff78d1', 7);

    if (center && radiusX && radiusZ) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(center[0], center[1]);
      ctx.lineTo(radiusX[0], radiusX[1]);
      ctx.moveTo(center[0], center[1]);
      ctx.lineTo(radiusZ[0], radiusZ[1]);
      if (rotation && radiusX) {
        ctx.moveTo(radiusX[0], radiusX[1]);
        ctx.lineTo(rotation[0], rotation[1]);
      }
      ctx.stroke();
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillStyle = '#44d7ff';
      ctx.fillText('X', radiusX[0] + 10, radiusX[1] - 8);
      ctx.fillStyle = '#ffd45c';
      ctx.fillText('Z', radiusZ[0] + 10, radiusZ[1] - 8);
      if (rotation) {
        ctx.fillStyle = '#ff78d1';
        ctx.fillText('R', rotation[0] + 10, rotation[1] - 8);
      }
      const hint = getLang() === 'zh'
        ? `拖动中心、X、Z${rotation ? ' 或旋转' : ''}手柄`
        : `Drag center, X, Z${rotation ? ', or rotation' : ''} handle`;
      ctx.font = '12px system-ui, sans-serif';
      const hintWidth = ctx.measureText(hint).width + 18;
      const hintX = Math.max(10, Math.min(this.viewport.width - hintWidth - 10, center[0] - hintWidth * 0.5));
      const hintY = Math.max(28, center[1] - 28);
      ctx.fillStyle = 'rgba(8, 18, 28, 0.76)';
      ctx.fillRect(hintX, hintY - 18, hintWidth, 24);
      ctx.fillStyle = '#e7f8ff';
      ctx.fillText(hint, hintX + 9, hintY - 2);
    }
    ctx.restore();
  }

  private drawHandle(handle: CloudGizmoHandle, point: Vec2, color: string, radius: number): void {
    this.handles.set(handle, point);
    this.context.beginPath();
    this.context.arc(point[0], point[1], radius, 0, Math.PI * 2);
    this.context.fillStyle = 'rgba(8, 18, 28, 0.9)';
    this.context.fill();
    this.context.strokeStyle = color;
    this.context.lineWidth = 3;
    this.context.stroke();
  }
}
