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

当前环境尚未建立可靠的 WebGPU timestamp-query 计时，因此阶段 7 的 GPU 时间比较仍保留为待办；现有证据只覆盖功能、视觉稳定性和无运行时错误，不把 CPU 截图耗时当作 GPU 时间。
