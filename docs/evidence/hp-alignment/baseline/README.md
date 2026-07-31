# HP density alignment baseline

> 2026-07-30 更新：低云 weather 已从 `weatherRepeat` 无限平铺迁移到 HP 式有限地图。当前固定场景使用中心 `(205000, 205000)m`、尺寸 `500km`；它保留旧基线附近的天气相位，同时让长视线进入径向 LUT 的未饱和区间。旧截图中的 `weatherRepeat=0.000032` 只描述迁移前历史基线。

> 低云 shape/detail 的生成式周期纹理增加轻微 XZ 错切。它补偿 demo atlas 相比 HP 原始资源更明显的轴向重复，避免相机轴向上前后云层的低密度孔洞精确重合；核心 DensityRemap、阈值、消光与散射公式不变。

> 远场 base shape 进一步使用双层旋转采样：第二层为 `1.618034×` 非整数频率、额外 `37°` 旋转、最大权重 `0.24`，只在 `18–90km` 渐入。该项是生成式 atlas 的去周期补偿，不属于 HP 密度公式。

Preset 由 `src/cloudPresets.ts` 定义，参数快照见 `presets.json`。同一 preset 默认保持交互；只有增加 `validation=1` 才进入固定验证模式。

启动 demo 后可用以下 URL 复现：

- `/?preset=side-cu&validation=1`
- `/?preset=oblique-cb&validation=1`
- `/?preset=oblique-tcu&validation=1`
- `/?preset=top-density&validation=1`
- `/?preset=detail-off&validation=1`
- `/?preset=hp-ocean-day&validation=1`

验证模式会停止动画，并把 time 固定为 6。首帧 GPU 提交完成后，`body[data-render-ready="true"]` 可供截图工具等待；不带 `validation=1` 时 GUI、相机和动画保持可交互。

`hp-ocean-day` 是与 HP 海面日景对照的主基线，直接使用唯一的 `LowCloud` evaluator，并锁定：

- 相机位置约 `(-3.69, 282.80, 0)` m，目标 `(10000, 2000, 0)` m，垂直 FOV `55°`
- 太阳方位角 `210°`、高度角 `35°`，曝光 `1.05`
- cloud type 直接读取 weather G，低云 detail 开启，Sc 使用 `0.35 × weather B`，高空云关闭
- Lo coverage 强度 `0.62`、对比度 `1.5`，最终密度倍率 `0.6`
- HP 低云光照开启：前/后双叶 HG、三阶 Hillaire MS、上下环境光和 upward AO
- 参考图：`HPVolumeCloud/compare/Snipaste_2026-07-05_10-31-41.png`

运行时会把上述实际值写入 `body.dataset.cameraPosition`、`cameraTarget`、`cameraFovYDeg`、`sunAzimuthDeg`、`sunElevationDeg` 和 `exposure`，截图工具可据此检查场景是否漂移。demo 目前使用程序化地面而非 HP 海面材质，因此该基线先对齐近云压入上缘的视角、地平线位置和照明方向，不把水面外观计入云体差异。当前 demo 仍缺少 HP 参考图中的远处多层云列，这是此固定基线刻意保留下来的后续形态差异。

### HP 低云光照 A/B

- `/?preset=hp-ocean-day&validation=1&hpLighting=0`：原 demo 光照；固定双叶 HG 混合、powder 乘太阳透射、经验环境多散射。
- `/?preset=hp-ocean-day&validation=1&hpLighting=1`：HP 光照骨架；前/后 HG 相加，三阶分别衰减 optical depth、能量贡献和偏心率；上方环境光使用太阳光路 OD 推导 upward AO，下方环境光按真实 slab 高度衰减。
- HP 路径不再把 low-cloud powder 乘到方向性散射上，以保留 HP 源码注释要求的前向银边。视线段仍使用 demo 的解析积分，避免自适应短步进把光能重复累加到过曝。
- 固定参数：`gForward=0.85`、`gBackward=0.3`、`MS=(attenuation 0.5, contribution 0.5, eccentricity 0.5)`、`ambient=(top 2.0, bottom 1.4)`、`AO=1.0`、`scatterSource=(OD scale 0.02, curve 1.0)`。

这一步对齐的是 HP/HDRP 方向性与乘性多阶散射骨架；HP 项目独立的加性 `phi_fwd` 漫射场尚未移植，不能把当前结果称为完整 HP 光照复刻。

### HP 低云云量 A/B

- 原始云量：`/?preset=hp-ocean-day&validation=1&loCovIntensity=1&loCovContrast=1&densityMultiplier=1&cloudType=0.5`
- 收敛后的固定画面：`/?preset=hp-ocean-day&validation=1`，对应 `loCovIntensity=0.62`、`loCovContrast=1.5`、`densityMultiplier=0.6`、`cloudType=-1`、`sc=0.35`
- `loCovIntensity` 与 `loCovContrast` 直接作用于 HP Lo weather coverage；`densityMultiplier` 只调节保留下来的云体厚度；`cloudType=-1` 表示从 weather G 读取空间类型，而不是固定覆盖。旧的全局 `coverage` 参数和第二套 support coverage 已删除。
- 本机 1280×720 WebGPU 证据为 `hp-ocean-day-density-before.png` / `hp-ocean-day-density-after.png`。调整后保留近景主云，但中央天空与中远景云列之间出现连续断口，地平线不再被同一层高密云毯完全封闭。

上述四项可用同名 URL 参数独立覆盖；实际运行值也会写入 `body.dataset.cloudTypeOverride`、`loCovCoverIntensity`、`loCovCoverContrast` 和 `densityMultiplier`，便于自动截图核验。

### HP 低云形态阶段 3 A/B

- 阶段 2 基线保持 `weatherRepeat=0.000032`、shape scale `(0.00011, 0.00011, 0.00011)`、detail scale `(0.0009, 0.0009, 0.0009)`、detail strength `0.42`，四通道低/高频权重为 `0.65/0.35`。
- 阶段 3 保持相同 weather、coverage、密度和 cloud-top 参数，只把 shape scale 调成 `(0.000145, 0.00009, 0.000145)`，detail scale 调成 `(0.0013, 0.00095, 0.0013)`，detail strength 调成 `0.56`，Billowy/Wispy 的低/高频权重均调成 `0.52/0.48`。
- XZ 频率高于 Y，使水平连成片的体块更容易被拆开，同时保留纵向发展的云柱；提高 detail 高频占比后，近景轮廓和内部空洞更清晰。阶段 3 没有改变 weatherRepeat，也没有启用 coverage-driven top stretch，因此不会用天气相位漂移或增厚云顶伪造形态改善。
- 本机 1280×720 WebGPU 证据为 `hp-ocean-day-morphology-before.png` / `hp-ocean-day-morphology-after.png`。after 中近景连续云墙被分解为独立主云，中部天空形成连续负空间，地平线附近可辨认出分层云列。

当前形态 A/B 使用 `weatherCenterX`、`weatherCenterZ`、`weatherSizeKm`、`shapeScaleX/Y/Z`、`detailScaleX/Y/Z`、`detailStrength`、`billowyLow/High`、`wispyLow/High` 和 `topStrength/topMax/topCurve` URL 参数复现；天气图实际值写入 `body.dataset.weatherMapCenter` 与 `weatherMapWorldSizeKm`。

远场双采样可用 `shapeSecondWeight=0` 回放单采样基线；默认参数为 `shapeSecondRatio=1.618034&shapeSecondRotationDeg=37&shapeSecondWeight=0.24`，实际值写入 `body.dataset.hpShapeSecondary`。近于 18 km 的采样不受影响，超过 90 km 后达到最大混合权重。

固定浏览器 A/B 中，`hp-ocean-day` 的近景主云和天空缺口保持稳定，变化主要位于地平线远云带；`top-density` 的近场俯视结果保持不变。俯视压力场景 GPU 时间样本约从 `64.0 ms` 增至 `68.1 ms`，主场景仍在 `48–49 ms` 波动范围，未出现 WGSL/WebGPU 错误。

### HP detail 原生路径校正

- 被否决的“按 `baseShape × heightGradient` 给实体核心屏蔽高频”方案已完整撤销。`VolumetricClouds.hlsl` 没有这层遮罩；保留它会在 `DensityRemap` 前改变侵蚀拓扑，把云体补厚成块。
- 当前重新严格采用 HP 顺序：四通道直接合成 Billowy/Wispy → 分别执行 `DensityRemap` → 乘 heightGradient → coverage threshold → 以 `smoothstep(0, WispyEdgeWidth, densityBillowy)` 在薄边选择 Wispy。
- 为减弱实体表面的均匀高频，只使用 HP 已有参数职责：Billowy 低/高频权重 `0.75/0.25`，Wispy 低/高频权重 `0.55/0.45`，detail strength `0.5`，`WispyEdgeWidth=0.2`，`WispyReach=0.22`。因此核心 Billowy 以低频为主，而保留较多高频的 Wispy 由 HP 的后阈值混合自然限制在边缘。
- A/B 使用阶段 3 参数 `detailStrength=0.56`、四通道权重 `0.52/0.48`、`WispyEdgeWidth=0.28`、`WispyReach=0.252`，对比当前 `/?preset=hp-ocean-day&validation=1`。证据为 `hp-ocean-day-hp-detail-before.png` / `hp-ocean-day-hp-detail-after.png`。

`wispyEdgeWidth` 与 `wispyReach` 也可通过同名 URL 参数覆盖；实际值写入 `body.dataset.hpWispyBlend`。HP 工程目录没有包含原始 `_ErosionNoise` 资产或 RenderDriver 默认参数，因此这里只宣称公式、通道职责和混合位置对齐，不宣称噪声体素逐值一致。

本机 1280×720 WebGPU 证据命名为 `hp-ocean-day-lighting-before.png` / `hp-ocean-day-lighting-after.png`。上方 70% 区域的平均 RGB 从约 `(126,132,139)` 提升到 `(157,162,168)`，平均绝对差约 `(21,21,20)`；HP 配对参考图的对应绝对差约 `(31,25,16)`，变化幅度处于同一量级。

截图命名约定：`<evaluator>-<preset>.png`。

运行时固定使用 `LowCloud + HighCloud` 两个 evaluator；`model` URL 参数不再解析，也不会改变 shader 路径。
通过 `&debug=Support`、`AfterShape`、`FinalDensity` 或 `DensityCoverage` 可覆盖场景默认 debug view。

HP detail 纹理使用独立资源，通道为 R WispyLow、G WispyHigh、B BillowyLow、A BillowyHigh。当前生成器只保证通道与频率角色，不宣称复现 HP 原始噪声资产。

Sc 强对照使用 `&sc=1`；`hp-ocean-day` 默认用 `sc=0.35`，局部强度仍逐像素乘 weather B。可用 `&sc=0` 验证关闭时回退到非 Sc 低云。

低云 weather 已恢复 HP 布局：R coverage、G cloud type、B Sc mask、A reserved。CloudLut 的 RGB 分别是 Cu/Tcu/Cb，`radialDist` 与 HP 一样由 `saturate(length(weatherUV - 0.5) * 2)` 计算。Hi-A 尚无独立空间纹理，先以显式 `hiAConstant` 驱动 edge softness；低云 darkness modulation 始终使用 density coverage。

`&mod=<0..1>` 可覆盖低云 darkness modulation 强度；0 会在 shader 中完全旁路该计算，作为无变化基线。

`&detailChannel=wispyLow|wispyHigh|billowyLow|billowyHigh` 会把对应 HP detail 权重置 1、其余置 0，用于验证通道 swizzle。

阶段 7 LOD / simple-mode 验证入口：

- `&noiseMip=<0..7>&erosionMip=<0..5>`：分别覆盖 HP shape 与 detail 的显式 3D mip LOD。
- `&simple=1`：强制所有 HP 密度采样跳过 detail；正常 raymarch 中仅 probe/ahead 自动使用 simple mode。
- `hpLowCloud-stage7-lod0-oblique-cb.png`、`hpLowCloud-stage7-mip2-oblique-cb.png` 与 `hpLowCloud-stage7-simple-oblique-cb.png` 是改名前保存的历史文件，分别记录完整 LOD 0、显式 LOD 2 与强制 simple 的结果。

阶段 7 已接入可选 WebGPU timestamp-query；不支持该 feature 的设备会显示 `data-gpu-timing-supported="false"`，但仍正常渲染。固定 `oblique-cb + LowCloud` 场景的本机趋势值记录在 `gpu-timing.json`，这些小样本结果只用于同机相对比较。

阶段 8 独立高空云入口：

- `&high=1`：启用独立 Ac/As 路径；默认关闭，关闭时不改变低云结果。
- `&highType=0|1`：强制 As 或 Ac；省略时使用 high-weather G。
- `&highDensity=<value>&highSteps=<count>`：覆盖高云独立密度倍率与步数。
- `&highThreshold=<value>&highSoftness=<value>`：控制 HP 高云的有效可见覆盖。
- `&highViewAbsorption=<value>&highLightAbsorption=<value>&highCoverAbsorption=<value>`：分别覆盖 HP 高云视线吸收、太阳光吸收和 coverage 自阴影调制。
- `&debug=HighWeather|HighBand|HighDensity`：分别检查 high-weather 通道、高度带和最终高云密度。
- `hpHigh-stage8-ac-oblique.png` 与 `hpHigh-stage8-as-oblique.png` 记录 Ac/As 最终合成；`hpHigh-stage8-weather.png`、`hpHigh-stage8-band-side.png`、`hpHigh-stage8-density.png` 记录独立调试输出。

高云关闭时，`LowCloud/oblique-cb` 与阶段 7 LOD 0 基线字节一致。

### 高空云覆盖 / 消光视觉调整 5

- 旧路径把低云 `extinction=0.095` 直接用于 4 km 高云球壳，长视线路径会累计为近不透明灰幕。调整后按 HP 源码使用独立 view/light absorption，并在视线消光中乘 high-weather A。
- 默认值为 `highDensityThreshold=0.50`、`highDensitySoftness=0.20`、`highViewAbsorption=0.012`、`highLightAbsorption=0.012`、`highCoverAbsorptionStrength=0.35`；原始 high-weather R 不被二次重映射。
- `hpHigh-stage5-coverage-optical-before.png` / `hpHigh-stage5-coverage-optical-after.png` 是固定 `hp-ocean-day&high=1` 的旧参数重放与新默认对照。
- `hpHigh-stage5-isolated-after.png` 使用 `densityMultiplier=0` 隔离高云；`hpHigh-stage5-density-after.png` 使用 `debug=HighDensity`，证明减少的是低 coverage 的有效占比和光学厚度，并非关闭高云。

### 曝光、天空颜色与 HDR tone mapping 视觉调整 6

- HP 的 `VolumetricClouds.hlsl` 在太阳光和环境光输入处乘 `GetCurrentExposureMultiplier()`，输出仍是线性 HDR；最终 tone mapping 由 HDRP 后处理负责。demo 现在同样先在线性空间合成背景、低云和高云，再统一应用曝光与显示变换。
- 默认显示变换从简单 Reinhard 改为 ACES fitted，并使用精确 linear-to-sRGB。`&toneMap=aces|reinhard` 可固定其他参数做曲线 A/B。
- `hp-ocean-day` 固定曝光为 `0.45`；天空线性天顶/地平线色为 `(0.008, 0.10, 0.70)` / `(0.06, 0.24, 0.72)`，sky intensity `1.6`、gradient exponent `0.65`、saturation `1.08`、contrast `1.0`。
- `hpPost-stage6-aces-after.png` 是最终合成；`hpPost-stage6-reinhard-control.png` 只切换 tone mapper；`hpPost-stage6-sky-after.png` 使用 `densityMultiplier=0&high=0` 检查天空。旧显示基线沿用 `hpHigh-stage5-coverage-optical-after.png`。
- URL 可覆盖 `exposure`、`toneMap`、`skyIntensity`、`saturation`、`contrast`；完整天空 RGB 参数在 `HP Sky / HDR Post` GUI 中调节。仓库没有 HP 场景对应的 Unity Volume Profile，因此该步骤对齐 HDR 合成职责、显示曲线类别和参考图视觉范围，不声称恢复未知的 HDRP Volume 数值。
