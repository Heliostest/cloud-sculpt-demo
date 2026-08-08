# Cloud Sculpt Raymarch Demo

HP 低云 detail 使用 `64³ RGBA8` 体积纹理：`R=WispyLow`、`G=WispyHigh`、`B=BillowyLow`、`A=BillowyHigh`。四通道分别采用独立 seed、频率组合与可平铺 domain warp。旧 demo 密度内核及其 RG detail 资源已删除。

HP 基础 shape 在采样前使用可调 Y 轴旋转和低频世界坐标扭曲，降低 128³ 纹理在短距离内的规则复现。18–90 km 远场还会渐入第二次旋转采样；默认频率比 `1.618034`、额外旋转 `37°`、最大权重 `0.24`，近场保持原始单采样不变。GUI 提供相关 `hpShape*` 参数；URL 可用 `shapeRotationDeg`、`shapeWarpScaleKm`、`shapeWarpStrengthM`、`shapeSecondRatio`、`shapeSecondRotationDeg` 和 `shapeSecondWeight` 进行 A/B。

低云天气图按 HP 的有限世界区域采样：默认中心为 `(205000, 205000)m`、世界尺寸为 `500km`，区域外密度为零，并使用 clamp sampler 避免边界回卷。RGB 布局为 `R=coverage`、`G=Cu development variation`、`B=Sc mask`，A 保留；云属由每层参数独立选择，不再编码进 weather texel。`hp-ocean-day` 默认使用 `cumulus` 与 `cumulusDevelopment=0.5`，以 `0.35 × ScMask` 混入 Sc，并用同一 weather UV 的中心距离采样 Cu/TCu/Cb 径向 LUT。URL 可用 `weatherCenterX`、`weatherCenterZ` 和 `weatherSizeKm` 覆盖；高空云仍保留独立的周期天气路径。

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

页面只有一个交互入口。GUI 顶部的 `Preset` 除场景和调试入口外，已经为十个 canonical genus 各提供至少一个验证 preset；`/?preset=<name>` 保持 GUI、相机和动画可交互，增加 `&validation=1` 才冻结时间、停止动画、隐藏 GUI 并提供截图就绪信号。十云属入口和复现方式记录在 `docs/evidence/genus-morphology/stage8-authoring/README.md`。用 URL 临时改云属时，可增加 `genusDefaultsN=1`，显式应用该云属的建议高度和范围，例如 `?genus0=cirrus&genusDefaults0=1`。

阶段 9 的固定证据位于 [`docs/evidence/genus-morphology/stage9-calibration/`](docs/evidence/genus-morphology/stage9-calibration/README.md)。验证 URL 支持 `view=side|oblique|top` 覆盖固定构图，也可用 `debug=Final|FinalDensity|Support|AfterShape` 检查形态分层。当前阶段 9 除 Ci 外已完成；Ci 仍按阶段 6 的用户决定保持未完成、暂时跳过。

阶段 10 的多云体性能硬化记录位于 [`docs/evidence/genus-morphology/stage10-performance/`](docs/evidence/genus-morphology/stage10-performance/README.md)。`/?preset=eight-body-stress&validation=1&bodyCount=1|2|4|8` 可固定实际启用数量；运行时通过 `data-volume-body-count`、`data-gpu-sample-count` 与 `data-gpu-ms` 暴露验证状态和 timestamp-query 结果。

每个 CloudBody 的“云属形态”在简洁模式仅显示当前 genus 相关的 2–4 项艺术控制；高级模式显示 snapshot 中完整的 8 项 recipe。界面会标记“默认配方/已自定义”，支持重置当前云属形态，并允许在切换 genus 前明确选择“加载新云属默认配方”或“保留当前自定义数值”。

渲染结构固定为 `LowCloud + HighCloud` 两个 evaluator，没有密度模式选择器，`model` URL 参数也不再参与解析。最多八个 `volume` body 通过 genus dispatcher 作为十云属的 canonical 实现；`local-volume` 固定为复用同一 Cb morphology recipe 的局部 hero 路径，`high-sheet` 固定为复用 Ac/As cell、sheet 与 erosion 语义的远景/性能路径。GUI 会直接标注当前渲染路径，特殊路径不代表额外云属。TCu 继续由 `genus=cumulus` 与 `cumulusDevelopment=0..1` 表示。验证 URL 可用 `enabledN=0|1`、`boundedN=0|1` 和 `bodyDensityN=<value>` 隔离 canonical body；以 `local=1&enabled0=0` 隔离 local Cb，或以 `high=1&highGenus=altocumulus|altostratus&enabled0=0` 隔离 high-sheet。旧 `highType=0|1` 和 `cloudType` 仅保留为兼容适配器。HP 低云仍支持 `noiseMip`、`erosionMip`、`simple` 和 `detailFade` 对照，高云可用 `highThreshold`、`highViewAbsorption`、`highLightAbsorption` 和 `HighWeather` / `HighBand` / `HighDensity` 调试视图检查。

最终颜色默认使用 HP/HDRP 风格的线性 HDR 合成与 ACES fitted 显示变换；`toneMap=aces|reinhard`、`exposure`、`skyIntensity`、`saturation`、`contrast` 可用于固定场景 A/B，天空线性 RGB 可在 `HP Sky / HDR Post` GUI 中调整。
