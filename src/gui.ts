import GUI from 'lil-gui';
import type { CameraPreset, DemoParams } from './params';

export function createGui(
  params: DemoParams,
  hooks: {
    onPreset: (p: CameraPreset) => void;
  },
): GUI {
  const gui = new GUI({ title: 'Cloud Sculpt' });

  const weather = gui.addFolder('Weather');
  weather.add(params, 'coverage', 0.1, 1.0, 0.01);
  weather.add(params, 'weatherExponent', 0.5, 3.0, 0.01);
  weather.add(params, 'mesoStrength', 0, 1, 0.01);
  weather.add(params, 'mesoContrast', 0.5, 3, 0.01);
  weather.add(params, 'weatherRepeat', 0.00002, 0.0003, 0.00001);
  weather.add(params, 'windSpeed', 0, 40, 0.1);
  weather.add(params, 'windAngleDeg', 0, 360, 1);

  const sculpt = gui.addFolder('Sculpt');
  sculpt.add(params, 'shapeAmount', 0, 1.5, 0.01);
  sculpt.add(params, 'shapeRepeat', 0.00005, 0.002, 0.00001);
  sculpt.add(params, 'detailStrength', 0, 1.5, 0.01);
  sculpt.add(params, 'detailRepeat', 0.0005, 0.01, 0.0001);
  sculpt.add(params, 'wispyEdgeWidth', 0.01, 0.4, 0.01);
  sculpt.add(params, 'detailOff');

  const sun = gui.addFolder('Sun');
  sun.add(params, 'sunAzimuthDeg', 0, 360, 1);
  sun.add(params, 'sunElevationDeg', 5, 80, 1);

  const layers = gui.addFolder('Layers');
  for (let i = 0; i < params.layers.length; i++) {
    const L = params.layers[i];
    const f = layers.addFolder(`L${i}`);
    f.add(L, 'enabled');
    f.add(L, 'baseKm', 0.2, 10, 0.05);
    f.add(L, 'topKm', 0.5, 12, 0.05);
    f.add(L, 'densityScale', 0, 2, 0.01);
    f.add(L, 'shapeAmount', 0, 1.5, 0.01);
    f.add(L, 'detailAmount', 0, 1.5, 0.01);
  }

  const hero = gui.addFolder('Hero');
  hero.add(params.hero, 'enabled');
  hero.add(params.hero, 'typeCb', 0, 1, 0.01).name('Cu→Cb');
  hero.add(params.hero, 'coverage', 0, 1, 0.01);
  hero.add(params.hero, 'densityMul', 0.2, 2.5, 0.01);

  const quality = gui.addFolder('Quality');
  quality.add(params, 'minPrimaryStep', 20, 200, 1);
  quality.add(params, 'maxPrimaryStep', 200, 1200, 1);
  quality.add(params, 'maxIterations', 64, 512, 1);
  quality.add(params, 'lightSteps', 4, 8, 1);
  quality.add(params, 'exposure', 0.2, 3, 0.01);

  gui.add(params, 'debugMode', ['Final', 'Support', 'AfterShape', 'FinalDensity', 'Weather']);

  const cam = {
    side: () => hooks.onPreset('side'),
    oblique45: () => hooks.onPreset('oblique45'),
    top: () => hooks.onPreset('top'),
  };
  const camFolder = gui.addFolder('Camera');
  camFolder.add(cam, 'side').name('侧视');
  camFolder.add(cam, 'oblique45').name('斜俯45');
  camFolder.add(cam, 'top').name('正俯');

  return gui;
}
