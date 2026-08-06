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

页面只有一个交互入口，GUI 顶部的 `Preset` 可选择 `Default`、`HP Ocean Day`、`Side Cu`、`Oblique TCu`、`Oblique Cb`、`Top Density` 和 `Detail Off`。`/?preset=hp-ocean-day` 会加载同名 preset 并保持 GUI、相机和动画可交互；增加 `&validation=1` 才冻结时间、停止动画、隐藏 GUI 并提供截图就绪信号。preset 参数记录在 `docs/evidence/hp-alignment/baseline/presets.json`。

渲染结构固定为 `LowCloud + HighCloud` 两个 evaluator，没有密度模式选择器，`model` URL 参数也不再参与解析。三个通用低云层分别保存标准十云属中的 `genus`；可用 `genus0..2` 独立指定。TCu 不作为额外云属，而由积云层的 `cuDevelopment0..2=0..1` 表示（Cu→TCu）；Cb 使用独立的 `cumulonimbus` genus。当前专用低云形态覆盖 Cu/TCu/Cb 与 Sc，其余 genus 暂时落入 Cu 兼容形态，等待独立密度配方。独立 Ac/As 高空云仍通过 `&high=1&highType=0|1` 启用，旧 `cloudType` URL 参数只作为 Cu/TCu/Cb 兼容适配器。旧 `?scenario=<name>` 链接仅作为兼容别名，等价于 `?preset=<name>&validation=1`。HP 低云仍支持 `noiseMip`、`erosionMip`、`simple` 和 `detailFade` 对照，高云可用 `highThreshold`、`highViewAbsorption`、`highLightAbsorption` 和 `HighWeather` / `HighBand` / `HighDensity` 调试视图检查。

最终颜色默认使用 HP/HDRP 风格的线性 HDR 合成与 ACES fitted 显示变换；`toneMap=aces|reinhard`、`exposure`、`skyIntensity`、`saturation`、`contrast` 可用于固定场景 A/B，天空线性 RGB 可在 `HP Sky / HDR Post` GUI 中调整。
