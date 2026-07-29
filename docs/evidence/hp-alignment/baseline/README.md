# HP density alignment baseline

固定场景由 `src/validationScenarios.ts` 定义，参数快照见 `scenarios.json`。

启动 demo 后可用以下 URL 复现：

- `/?scenario=side-cu`
- `/?scenario=oblique-cb`
- `/?scenario=oblique-tcu`
- `/?scenario=top-density`
- `/?scenario=detail-off`

验证场景会停止 wind，并把 time 固定为 6。首帧 GPU 提交完成后，`body[data-render-ready="true"]` 可供截图工具等待。

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
