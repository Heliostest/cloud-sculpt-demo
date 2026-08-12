import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const sourceUrl = new URL('../src/cloudGizmo.ts', import.meta.url);
let source = await readFile(sourceUrl, 'utf8');
source = source.replace("import { getLang } from './i18n';", "const getLang = () => 'en';");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const {
  cameraBasis,
  ellipseWorldPoint,
  intersectHorizontalPlane,
  normalizeRotationDegrees,
  projectWorldToScreen,
  rotationHandleWorldPoint,
  screenPointToRay,
} = await import(moduleUrl);

const camera = {
  position: [0, 10, 10],
  target: [0, 0, 0],
  fovY: Math.PI / 2,
};
const viewport = { width: 1000, height: 1000 };

test('camera target projects to the center of the viewport', () => {
  assert.deepEqual(projectWorldToScreen(camera.target, camera, viewport), [500, 500]);
});

test('screen-center ray hits the camera target plane at the target', () => {
  const ray = screenPointToRay([500, 500], camera, viewport);
  const hit = intersectHorizontalPlane(ray.origin, ray.direction, 0);
  assert.ok(hit);
  assert.ok(Math.abs(hit[0]) < 1e-9);
  assert.ok(Math.abs(hit[1]) < 1e-9);
  assert.ok(Math.abs(hit[2]) < 1e-9);
});

test('camera basis stays finite for a vertical top camera', () => {
  const basis = cameraBasis({ position: [0, 100, 0], target: [0, 0, 0], fovY: 1 });
  for (const axis of [basis.forward, basis.right, basis.up]) {
    assert.ok(axis.every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(...axis) - 1) < 1e-9);
  }
});

test('ellipse handles follow cloud-body rotation in world space', () => {
  const body = {
    centerX: 10,
    centerZ: 20,
    radiusX: 100,
    radiusZ: 50,
    rotationDeg: 90,
  };
  const xHandle = ellipseWorldPoint(body, 0, 1234);
  const zHandle = ellipseWorldPoint(body, Math.PI / 2, 1234);
  assert.ok(Math.abs(xHandle[0] - 10) < 1e-9);
  assert.ok(Math.abs(xHandle[2] - 120) < 1e-9);
  assert.ok(Math.abs(zHandle[0] + 40) < 1e-9);
  assert.ok(Math.abs(zHandle[2] - 20) < 1e-9);

  const rotationHandle = rotationHandleWorldPoint(body, 1234);
  assert.ok(Math.abs(rotationHandle[0] - 10) < 1e-9);
  assert.ok(Math.abs(rotationHandle[2] - 620) < 1e-9);
});

test('rotation drag values wrap into the GUI rotation interval', () => {
  assert.equal(normalizeRotationDegrees(190), -170);
  assert.equal(normalizeRotationDegrees(-190), 170);
  assert.equal(normalizeRotationDegrees(540), -180);
});

test('GUI selection and canvas pointer arbitration stay wired together', async () => {
  const [guiSource, mainSource, bodiesSource] = await Promise.all([
    readFile(new URL('../src/gui.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/cloudBodies.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(guiSource, /onCloudSelection/);
  assert.match(guiSource, /cloud-body-selected/);
  assert.match(mainSource, /gizmo\.pointerDown\(e\)/);
  assert.match(mainSource, /gizmo\.pointerMove\(e\)/);
  assert.match(mainSource, /gizmo\.update\(cam,/);
  assert.match(mainSource, /const bodyStore = CloudBodyStore\.createDefault\(\(\) => params\.sceneTime\)/);
  assert.match(mainSource, /createGui\(params, bodyStore,/);
  assert.match(mainSource, /renderer\.render\(params, bodyStore\.bodies,/);
  assert.doesNotMatch(guiSource, /new CloudBodyStore\(params\)/);
  assert.doesNotMatch(bodiesSource, /rendererSlot|CloudBodySlot|private readonly params/);
  assert.match(bodiesSource, /static createDefault\(currentSceneTime:/);
  assert.doesNotMatch(bodiesSource, /DemoParams|fromLegacyParams|replaceFromLegacyParams/);
});

test('GUI and main apply presets directly to the object collection with explicit genus placement', async () => {
  const [guiSource, mainSource, bodiesSource, i18nSource] = await Promise.all([
    readFile(new URL('../src/gui.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/cloudBodies.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/i18n.ts', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(guiSource, /replaceFromLegacyParams/);
  assert.match(mainSource, /applyCloudBodyPreset\(bodyStore, currentPreset\)/);
  assert.match(mainSource, /syncParameterDataset\(params, bodyStore\.bodies\)/);
  assert.match(guiSource, /folder\.add\(body, 'placementLocked'\)/);
  assert.match(guiSource, /body\.applyGenusDefaults\(\)/);
  assert.match(guiSource, /body\.supportsRuntimeControls/);
  assert.match(guiSource, /folderLabel\('bodyMotion'\)/);
  assert.match(guiSource, /folderLabel\('bodyLifecycle'\)/);
  assert.match(guiSource, /advancedBodyFolders/);
  assert.match(guiSource, /lifecycleFolder\.add\(body, 'lifeEnabled'\)/);
  assert.match(guiSource, /cloudRenderPathLabel\(body\.path\)/);
  assert.match(guiSource, /folder\.add\(body, 'path'\)\.disable\(\)/);
  assert.match(guiSource, /body\?\.isLocal/);
  assert.match(mainSource, /query\.get\(`enabled\$\{i\}`\)/);
  assert.match(mainSource, /query\.get\(`bounded\$\{i\}`\)/);
  assert.match(mainSource, /query\.get\(`bodyDensity\$\{i\}`\)/);
  assert.match(mainSource, /query\.get\('local'\)/);
  assert.match(mainSource, /bodyStore\.add\('local-volume', true\)/);
  assert.match(mainSource, /applyCloudPresetCamera\(currentPreset, bodyStore\.bodies, orbit/);
  assert.match(mainSource, /query\.get\('view'\)/);
  assert.match(mainSource, /document\.body\.dataset\.validationView/);
  assert.match(mainSource, /query\.get\('bodyCount'\)/);
  assert.match(mainSource, /data\.volumeBodyCount = String\(volumeBodies\.length\)/);
  assert.match(guiSource, /BASIC_MORPHOLOGY_FIELDS/);
  assert.match(guiSource, /addMorphologyControls\(advancedMorphologyFolder, CLOUD_MORPHOLOGY_FIELDS\)/);
  assert.match(guiSource, /body\.setGenus\(value, bodyAuthoring\.genusMorphologyChange\)/);
  assert.match(guiSource, /body\.resetMorphology\(\)/);
  assert.match(guiSource, /morphologyStatusLabel\(body\.morphologyIsDefault\)/);
  assert.match(guiSource, /bodyStore\.onSnapshotRestored/);
  assert.match(bodiesSource, /export const CLOUD_MORPHOLOGY_FIELDS/);
  assert.match(bodiesSource, /morphologyChange === 'preserve-custom'/);
  for (const field of [
    'verticalDevelopment', 'cellScale', 'cellStrength', 'sheetUniformity',
    'fiberStrength', 'fiberAngleDeg', 'anvilStrength', 'erosionScale',
  ]) {
    assert.match(i18nSource, new RegExp(`${field}: parameter\\(`));
  }
  assert.doesNotMatch(guiSource, /high\.add\(params, '(?:highBaseKm|highTopKm|highDensityMultiplier)'/);
  assert.doesNotMatch(guiSource, /highCell\.add\(params, 'highWispStrength'/);
});
