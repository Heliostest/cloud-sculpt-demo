# HP density alignment baseline

固定场景由 `src/validationScenarios.ts` 定义，参数快照见 `scenarios.json`。

启动 demo 后可用以下 URL 复现：

- `/?scenario=side-cu`
- `/?scenario=oblique-cb`
- `/?scenario=oblique-tcu`
- `/?scenario=top-density`
- `/?scenario=detail-off`
- `/?scenario=hp-ocean-day`

验证场景会停止 wind，并把 time 固定为 6。首帧 GPU 提交完成后，`body[data-render-ready="true"]` 可供截图工具等待。

`hp-ocean-day` 是与 HP 海面日景对照的主基线，直接选择 `hpLowCloud`，并锁定：

- 相机位置约 `(-3.69, 282.80, 0)` m，目标 `(10000, 2000, 0)` m，垂直 FOV `55°`
- 太阳方位角 `210°`、高度角 `35°`，曝光 `1.05`
- Cu/Tcu 混合类型 `0.2`、低云 detail 开启、Sc 和高空云关闭
- Lo coverage 强度 `0.62`、对比度 `1.5`，最终密度倍率 `0.6`
- HP 低云光照开启：前/后双叶 HG、三阶 Hillaire MS、上下环境光和 upward AO
- 参考图：`HPVolumeCloud/compare/Snipaste_2026-07-05_10-31-41.png`

运行时会把上述实际值写入 `body.dataset.cameraPosition`、`cameraTarget`、`cameraFovYDeg`、`sunAzimuthDeg`、`sunElevationDeg` 和 `exposure`，截图工具可据此检查场景是否漂移。demo 目前使用程序化地面而非 HP 海面材质，因此该基线先对齐近云压入上缘的视角、地平线位置和照明方向，不把水面外观计入云体差异。当前 demo 仍缺少 HP 参考图中的远处多层云列，这是此固定基线刻意保留下来的后续形态差异。

### HP 低云光照 A/B

- `/?scenario=hp-ocean-day&hpLighting=0`：原 demo 光照；固定双叶 HG 混合、powder 乘太阳透射、经验环境多散射。
- `/?scenario=hp-ocean-day&hpLighting=1`：HP 光照骨架；前/后 HG 相加，三阶分别衰减 optical depth、能量贡献和偏心率；上方环境光使用太阳光路 OD 推导 upward AO，下方环境光按真实 slab 高度衰减。
- HP 路径不再把 low-cloud powder 乘到方向性散射上，以保留 HP 源码注释要求的前向银边。视线段仍使用 demo 的解析积分，避免自适应短步进把光能重复累加到过曝。
- 固定参数：`gForward=0.85`、`gBackward=0.3`、`MS=(attenuation 0.5, contribution 0.5, eccentricity 0.5)`、`ambient=(top 2.0, bottom 1.4)`、`AO=1.0`、`scatterSource=(OD scale 0.02, curve 1.0)`。

这一步对齐的是 HP/HDRP 方向性与乘性多阶散射骨架；HP 项目独立的加性 `phi_fwd` 漫射场尚未移植，不能把当前结果称为完整 HP 光照复刻。

### HP 低云云量 A/B

- 原始云量：`/?scenario=hp-ocean-day&loCovIntensity=1&loCovContrast=1&densityMultiplier=1&cloudType=0.5`
- 收敛后的固定场景：`/?scenario=hp-ocean-day`，对应 `loCovIntensity=0.62`、`loCovContrast=1.5`、`densityMultiplier=0.6`、`cloudType=0.2`
- `loCovIntensity` 与 `loCovContrast` 直接作用于 HP Lo weather coverage；`densityMultiplier` 只调节保留下来的云体厚度，`cloudType` 则把垂直轮廓从 Tcu 略微移向较低矮的 Cu。普通 `coverage` 参数不负责 `hpLowCloud` 的最终 coverage，不能用它完成这次云量校准。
- 本机 1280×720 WebGPU 证据为 `hp-ocean-day-density-before.png` / `hp-ocean-day-density-after.png`。调整后保留近景主云，但中央天空与中远景云列之间出现连续断口，地平线不再被同一层高密云毯完全封闭。

上述四项可用同名 URL 参数独立覆盖；实际运行值也会写入 `body.dataset.cloudTypeOverride`、`loCovCoverIntensity`、`loCovCoverContrast` 和 `densityMultiplier`，便于自动截图核验。

本机 1280×720 WebGPU 证据命名为 `hp-ocean-day-lighting-before.png` / `hp-ocean-day-lighting-after.png`。上方 70% 区域的平均 RGB 从约 `(126,132,139)` 提升到 `(157,162,168)`，平均绝对差约 `(21,21,20)`；HP 配对参考图的对应绝对差约 `(31,25,16)`，变化幅度处于同一量级。关闭 HP 光照后的 `current/side-cu` 与旧基线平均每通道漂移低于 1 个 8-bit 码值。

截图命名约定：`<density-model>-<scenario>.png`。

通过 `&model=hpCore` 或 `&model=hpLowCloud` 可在完全相同的相机、天气、时间与噪声相位下做 A/B 对照；省略时使用 `current`。
通过 `&debug=Support`、`AfterShape`、`FinalDensity` 或 `DensityCoverage` 可覆盖场景默认 debug view。

HP detail 纹理使用独立资源，通道为 R WispyLow、G WispyHigh、B BillowyLow、A BillowyHigh。当前生成器只保证通道与频率角色，不宣称复现 HP 原始噪声资产。

Sc 验证使用 `&model=hpLowCloud&sc=1`；省略 `sc` 时默认关闭，必须与非 Sc 基线一致。

CloudLut 的 RGB 分别是 Cu/Tcu/Cb。由于 demo weather 采用 repeat、没有 HP 的有限地图中心，当前 `radialDist` 固定为 0；这是有意保留差异。Hi-A 尚无独立空间纹理，先以显式 `hiAConstant` 驱动 edge softness；低云 darkness modulation 始终使用 density coverage。

`&mod=<0..1>` 可覆盖低云 darkness modulation 强度；0 会在 shader 中完全旁路该计算，作为无变化基线。

`&detailChannel=wispyLow|wispyHigh|billowyLow|billowyHigh` 会把对应 HP detail 权重置 1、其余置 0，用于验证通道 swizzle。

阶段 7 LOD / simple-mode 验证入口：

- `&noiseMip=<0..7>&erosionMip=<0..5>`：分别覆盖 HP shape 与 detail 的显式 3D mip LOD。
- `&simple=1`：强制所有 HP 密度采样跳过 detail；正常 raymarch 中仅 probe/ahead 自动使用 simple mode。
- `stage7-current-side-cu.png` 与 `current-side-cu.png` 字节一致，证明 mip 资源迁移没有改变 current 的 LOD 0 回归结果。
- `hpLowCloud-stage7-lod0-oblique-cb.png`、`hpLowCloud-stage7-mip2-oblique-cb.png` 与 `hpLowCloud-stage7-simple-oblique-cb.png` 分别记录完整 LOD 0、显式 LOD 2 与强制 simple 的结果。

阶段 7 已接入可选 WebGPU timestamp-query；不支持该 feature 的设备会显示 `data-gpu-timing-supported="false"`，但仍正常渲染。固定 `oblique-cb + hpLowCloud` 场景的本机趋势值记录在 `gpu-timing.json`，这些小样本结果只用于同机相对比较。

阶段 8 独立高空云入口：

- `&high=1`：启用独立 Ac/As 路径；默认关闭，关闭时不改变低云结果。
- `&highType=0|1`：强制 As 或 Ac；省略时使用 high-weather G。
- `&highDensity=<value>&highSteps=<count>`：覆盖高云独立密度倍率与步数。
- `&debug=HighWeather|HighBand|HighDensity`：分别检查 high-weather 通道、高度带和最终高云密度。
- `hpHigh-stage8-ac-oblique.png` 与 `hpHigh-stage8-as-oblique.png` 记录 Ac/As 最终合成；`hpHigh-stage8-weather.png`、`hpHigh-stage8-band-side.png`、`hpHigh-stage8-density.png` 记录独立调试输出。

高云关闭时，阶段 8 的 `current/side-cu` 与阶段 0 基线字节一致，`hpLowCloud/oblique-cb` 与阶段 7 LOD 0 基线字节一致。
