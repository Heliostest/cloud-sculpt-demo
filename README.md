# Cloud Sculpt Raymarch Demo

HP 低云 detail 使用 `64³ RGBA8` 体积纹理：`R=WispyLow`、`G=WispyHigh`、`B=BillowyLow`、`A=BillowyHigh`。四通道分别采用独立 seed、频率组合与可平铺 domain warp；current 兼容路径也提升为 `64³`，但继续保留原有 RG 语义。

HP 基础 shape 在采样前使用可调 Y 轴旋转和低频世界坐标扭曲，降低 128³ 纹理在短距离内的规则复现。18–90 km 远场还会渐入第二次旋转采样；默认频率比 `1.618034`、额外旋转 `37°`、最大权重 `0.24`，近场保持原始单采样不变。GUI 提供相关 `hpShape*` 参数；URL 可用 `shapeRotationDeg`、`shapeWarpScaleKm`、`shapeWarpStrengthM`、`shapeSecondRatio`、`shapeSecondRotationDeg` 和 `shapeSecondWeight` 进行 A/B。

低云天气图按 HP 的有限世界区域采样：默认中心为 `(205000, 205000)m`、世界尺寸为 `500km`，区域外密度为零，并使用 clamp sampler 避免边界回卷。RGB 恢复 HP 布局 `R=coverage`、`G=cloud type`、`B=Sc mask`，A 仅保留给 demo 原有 support 路径的 meso 信号。`hp-ocean-day` 默认直接读取空间 cloud type、以 `0.35 × ScMask` 启用 Sc，并用同一 weather UV 的中心距离采样 Cu/Tcu/Cb 径向 LUT。URL 可用 `weatherCenterX`、`weatherCenterZ` 和 `weatherSizeKm` 覆盖；高空云仍保留独立的周期天气路径。

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
npm run test:weather
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

密度模式可通过 `&model=current|hpCore|hpLowCloud` 切换。HP 低云支持 `noiseMip`、`erosionMip`、`simple` 和 `detailFade` 对照；独立 Ac/As 高空云通过 `&high=1&highType=0|1` 启用，并可用 `highThreshold`、`highViewAbsorption`、`highLightAbsorption` 和 `HighWeather` / `HighBand` / `HighDensity` 调试视图检查。完整复现参数与截图见 `docs/evidence/hp-alignment/baseline/README.md`。

最终颜色默认使用 HP/HDRP 风格的线性 HDR 合成与 ACES fitted 显示变换；`toneMap=aces|reinhard`、`exposure`、`skyIntensity`、`saturation`、`contrast` 可用于固定场景 A/B，天空线性 RGB 可在 `HP Sky / HDR Post` GUI 中调整。
