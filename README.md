# Cloud Sculpt Raymarch Demo

独立 WebGPU 云雕原型（阶段 A）。

## 运行

```bash
npm install
npm run dev
```

```bash
npm run typecheck
npm run build
npm run test:density
```

需要支持 WebGPU 的浏览器（Chrome / Edge）。

## 第三方归属

本 demo 的噪声雕刻与光照思路参考下列开源项目，**不复制其运行时**；分发时保留其许可声明：

- **TileableVolumeNoise / `@takram/three-clouds`（three-geospatial）** — MIT  
  天气门控、Shape Perlin-Worley remap、多层采样语义参考。
- **HPVolumeCloud（HanPi / AshenOneArt）** — MIT + 附加署名  
  Billowy/Wispy detail、DensityRemap、锥形 light march 思路参考。  
  若含 HDRP 派生思路，需另行遵守 Unity/HDRP 许可。

规格：`docs/superpowers/specs/2026-07-29-cloud-sculpt-raymarch-demo-design.md`

HP 密度差异审计与渐进对齐计划：[`HP_DENSITY_ALIGNMENT_ROADMAP.md`](HP_DENSITY_ALIGNMENT_ROADMAP.md)

固定视觉验证场景：`/?scenario=hp-ocean-day`、`side-cu`、`oblique-cb`、`top-density`、`detail-off`。其中 `hp-ocean-day` 锁定 HP 海面参考图的相机/FOV、太阳、曝光、时间和 HP 低云光照；用 `&hpLighting=0|1` 可在相同密度下切换 legacy/HP 光照。场景参数记录在 `docs/evidence/hp-alignment/baseline/scenarios.json`。

密度模式可通过 `&model=current|hpCore|hpLowCloud` 切换。HP 低云支持 `noiseMip`、`erosionMip`、`simple` 和 `detailFade` 对照；独立 Ac/As 高空云通过 `&high=1&highType=0|1` 启用，并可用 `HighWeather`、`HighBand`、`HighDensity` 调试视图检查。完整复现参数与截图见 `docs/evidence/hp-alignment/baseline/README.md`。
