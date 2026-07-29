# cloud-sculpt-demo 与 HPVolumeCloud 密度对齐路线图

> 核查基线：2026-07-29 当前工作树。本文只审计并规划密度生成；光照、散射积分和 HDRP 接入不在本轮范围内。

## 1. 结论摘要

原差异表的方向基本正确，但不能据此认定两边已经等价。最重要的修正是：

1. `cloudFromShape` 内部已经采用 `baseShape → detail erosion → × heightGradient → coverage threshold → Billowy/Wispy mix` 的局部顺序；整个密度调用链并未对齐。
2. demo 传给阈值阶段的 `cov` 已经过 `coverageSignal → U.coverage/heightScale 门控 → remap → smooth`。HP 使用的是经 Lo coverage 强度/对比度调整、但没有经过这套 support remap 的 coverage。两者即使都写 `1 - coverage`，输入语义也不同。
3. demo 的 detail 资源物理上仍是 RGBA8 3D 纹理，不是 RG 纹理；只是 shader 只消费 R/G。B 中的 fine noise 当前未使用，A 固定为 1。
4. HP 的 `DensityRemap` 本身不 clamp，调用点再 `saturate`；demo 的 `densityRemap` 内部调用带分母保护的 `remapClamped`。常规参数下结果等价，边界条件并非逐位等价。
5. 除原表所列项目外，尚有 weather 通道、coverage 预处理、早退阈值、shape 通道合成、采样 LOD、云型体系、分层合成、密度输出范围、独立高空云路径等关键差异。

因此，当前状态应描述为：**demo 已借用并局部对齐 HP 的 Billowy/Wispy 侵蚀拓扑，但仍是 three-geospatial 风格 support 与 demo 自有多层/hero 逻辑包裹的混合模型。**

## 2. 对比范围与源码锚点

- HP 低云入口：[`EvaluateCloudProperties`](../HPVolumeCloud/VolumetricClouds.hlsl#L430)
- HP 通用 remap：[`DensityRemap`](../HPVolumeCloud/VolumetricClouds.hlsl#L365)
- HP 低云侵蚀与阈值：[`VolumetricClouds.hlsl` 571 行附近](../HPVolumeCloud/VolumetricClouds.hlsl#L571)
- HP 独立高空云入口：[`EvaluateHighCloudDensity`](../HPVolumeCloud/VolumetricClouds.hlsl#L621)
- demo 密度入口：[`evaluateSculpted`](shaders/density.wgsl#L208)
- demo 单层入口：[`evaluateLayer`](shaders/density.wgsl#L148)
- demo 侵蚀核心：[`cloudFromShape`](shaders/density.wgsl#L105)
- demo remap helper：[`common.wgsl`](shaders/common.wgsl#L46)
- demo shape/detail 纹理生成：[`noiseAtlasGen.ts`](src/noiseAtlasGen.ts#L96)

本文基于当前未提交的 `shaders/density.wgsl` 与 `src/params.ts` 内容核查；后续实现时，先确认这两处用户改动仍是预期基线，不覆盖或回滚它们。

## 3. 对原差异表的逐项核实

| 项目 | 核实结论 | 精确记录 |
| --- | --- | --- |
| 蚀刻函数 | 基本正确，需补边界差异 | HP 的五参数 `DensityRemap` 只做线性映射，不 clamp、不保护 `b == a`；实际调用外包 `saturate`。demo 的二参数 `densityRemap(d, low)` 固定映射到 `[0,1]`，内部 clamp，并用 `max(1e-5, 1-low)` 防止除零。demo GUI 允许组合强度令 `low >= 1`，所以这不只是理论边界。 |
| 蚀刻公式 | 局部等价 | HP 为 `saturate(DensityRemap(baseShape, detail * strength, 1, 0, 1))`；demo 为 `densityRemap(shape, det * detailStr)`。在 `low < 1` 时代数等价。demo 的 `shape` 还受 `shapeAmount` 和底部 fade 影响。 |
| 调用位置 | 正确 | HP 在 `EvaluateCloudProperties`，demo 在 `cloudFromShape`；demo 外层实际入口是 `evaluateSculpted → evaluateLayer → cloudFromShape`。 |
| 流程顺序 | 仅局部正确 | `cloudFromShape` 内顺序已对齐。全链路中 demo 先把 weather 做 support remap/smooth，且 profile/hFade 参与 support；HP 则先分别计算 coverage、高度变换、LUT 与 Sc，再进入相同侵蚀拓扑。 |
| baseShape | 基本正确，有遗漏 | HP 只取 `_Worley128RGBA.r` 后 `pow(abs(r), 0.6)`。demo 的 `sampleShape` 先做 `0.88R + 0.10G + 0.02B`，再以 `max(1e-4, sampleShape)` 为底做 `pow(..., 0.6)`，并用 `shapeAmount × layerShapeAmount × mix(0.85,0.65,typeMix)` 混回 1。 |
| 底平滑 | 公式方向正确 | HP 的高度与幂均为参数，且高度基于经过 coverage 顶部拉伸/Sc 压缩后的 `localHeight`。demo 写死 `h01/0.14` 与 `pow(...,1.4)`，基于每层原始归一化高度。两边都把 base shape 拉向 1，并把 detail 强度乘 fade。 |
| detail 纹理 | 原表“RG”不准确 | 两边物理资源都是 RGBA。HP 语义为 R WispyLow、G WispyHigh、B BillowyLow、A BillowyHigh。demo 生成 R billowy、G wispy、B fine、A=1，但 shader 只读取 R/G。 |
| detail 合成 | 正确 | HP 分别按两组可调 low/high 权重合成 Billowy/Wispy；demo 直接把 R/G 当成两种侵蚀场，B fine 未接入。 |
| detail UV | 基本正确，有重要遗漏 | HP 使用 `(x,-y,z) * scalarScale + noiseOffset*0.5 + horizontalWind + verticalWind`。demo 使用 `worldPos * scalarRepeat + CPU detailOffset + 3D morph`；没有 Y 翻转，动画方向和相位构成不同。 |
| detail 强度 | 正确但不完整 | HP 为 Cu/Tcu/Cb 三段插值，再向 Sc 独立强度插值，并由 `simpleMode` 完全跳过。demo 为全局强度 × per-layer amount × Cu/Cb 线性因子 × 顶区加成 × bottom fade × step-length fade；没有 Tcu/Sc 参数。 |
| coverage 阈值 | 字面正确，语义未对齐 | HP 阈值为 `(1 - coverage) + _HP_DensityThreshold`。demo 为 `1 - cov`，没有 density offset；但更大的差异是 demo 的 `cov` 已是 support remap 后的值，并非 HP coverage。 |
| WispyReach | 正确 | HP 狭义外延是独立 `_HP_WispyReach`。demo 把它耦合为 `wispyEdgeWidth * 0.9`，无法独立调节。 |
| edgeSoftness | 正确 | HP 从 `_CloudMapHiTexture.a` 经 `HP_HI_A_DENSITY_SOFTNESS` 得到空间变化的 softness。demo 按 Cu/Cb `typeMix` 写死 `mix(0.18,0.32)`；没有 Hi A 输入。 |
| heightGradient | 正确但不完整 | HP 从 2D CloudLut 按 `(localHeight, radialDist)` 采样 Cu/Tcu/Cb，再受 Sc 影响。demo 用 Cu/Cb 解析 profile；此外还额外乘一次独立 `hFade`，且没有 radial dependence。 |
| wispy 高度衰减 | 正确但高度基准不同 | HP 使用全局 slab `properties.height`，起点/硬度可调，实际指数为 `_HP_WispyTopHardness * 10`。demo 使用每层 `h01`，起点 0.55、指数 2.2 均写死。 |
| 混合 | 结构正确，有一个数值差异 | demo 的 `softstep` 就是 `smoothstep` 别名。HP 使用 `_HP_WispyEdgeWidth`；demo 使用 `max(wispyEdgeWidth, 0.08)`，因此宽度不能低于 0.08。 |
| 后续 | 方向正确但遗漏较多 | HP 还应用 Sc `heightClip`、Cu/Tcu/Cb 密度倍率、全局密度倍率与 coverage 驱动的 `HP_HI_A_DENSITY_SCALE`，且最终密度可大于 1。demo 只在核心末尾乘 `densScale` 并 clamp 到不超过 1，随后还乘相机距离 fade；raymarch 再按 type 调整消光。 |

## 4. 原表遗漏的差异

### 4.1 Weather 与 coverage 不是同一套信号

HP 低云 weather 通道是 `R=LoCoverage, G=Cu/Tcu/Cb type, B=ScMask, A=reserved`，另外采样 Hi Weather 的 A 来调 edge softness。Lo coverage 还分为两条可独立调节的路径：

- Cover 路径：`pow(raw, contrast) × intensity`，参与密度阈值。
- Height 路径：另一组 contrast/intensity，参与 coverage 驱动的云顶拉伸。

demo 的 weather 是 `R=macro, G=meso, B=Cu/Cb type, A=1`。`coverageSignal` 先合成 R/G，随后又经过全局 `U.coverage`、高度半圆、type filter width、remap 和 smooth，才得到传入侵蚀核心的 `cov`。这不是参数名差异，而是函数域和视觉响应曲线都不同。

### 4.2 高度体系与云型体系不同

HP 低云在一个球形 slab 内得到全局 normalized height，再做 coverage 顶部拉伸、Sc 高度压缩和 Cu/Tcu/Cb LUT 插值。demo 对每一层分别用 `baseM/topM` 求 `h01`，解析构造 Cu/Cb profile，并另有 anvil footprint 与 hero body。

因此，简单把 demo 的解析 profile 替换为 LUT 仍不能得到 HP 结果；必须先决定 LUT 的输入高度是否也复制 HP 的变换语义。

### 4.3 Shape 采样策略不同

- HP：R 通道、可各轴缩放、显式 noise mip、风偏移，无 `shapeAmount`。
- demo：RGB 固定加权、单一 repeat、LOD 0、额外垂直时间相位，并按全局/层/type 的 shape amount 把结果混回 1。
- demo CPU 已按 `shapeRepeat` 累积 `shapeOffset`，shader 又叠加按 `weatherRepeat` 累积的 `U.windOffset * 0.35`；这两项单位/频率不同，需要在对齐前拆清，不能笼统视为一个 HP 风偏移。

demo 的 shape generator 虽然写入了 RGBA 多频数据，但这套 RGB 合成不是 HP 的 R-only base shape。

### 4.4 质量降级策略不同

HP 由调用者传入 `noiseMipOffset` 和 `erosionMipOffset`，并用 `simpleMode` 在粗探测时完全跳过 detail。demo 所有 3D 采样固定 `textureSampleLevel(..., 0)`；只根据当前 ray step length 连续衰减 detail。后者是抗欠采样策略，但不等于 mip LOD，也没有降低 shape 采样频率。

### 4.5 早退和空域判定不同

HP 的低云密度分支以 `coverage >= 0.1` 门控；只有同时满足 `coverage < 0.1 && !needHighCloud` 时，整个 `EvaluateCloudProperties` 才提前返回。demo 在 support remap 后以 `cov <= 0.001` 或 `profile <= 0` 早退；raymarch 还以 `density > 0.012` 决定是否积分，并使用 density 前瞻调整步长。这些阈值共同影响薄边是否存在，不能只比较 `cloudFromShape`。

### 4.6 分层合成和空间边界不同

demo 的普通三层按最大 density 选择主层，support 独立取最大值；hero 则仅在 `heroSupport > bestSupport` 时整体替换当前结果，并不是按 hero density 与普通层比较。最终结果再乘相机距离 fade。HP 低云函数本身没有这套多层/hero 选择；天气图 UV 超出有限区域时直接返回，而 demo 使用 repeat weather 并用 camera-relative distance fade 收边。

### 4.7 高空云不是同一种实现

HP 的 Ac/As 走独立 `EvaluateHighCloudDensity`：只采样 2D high-weather、cell、warp 和 wisp，使用独立高度带和密度参数，不走低云 3D shape/detail。demo 的高层仍复用 `evaluateLayer`，只是默认把 detail amount 设为 0。因此“有第三层”不代表已实现 HP 高空云。

## 5. 目标分级

为了避免把一次视觉实验变成不可验证的大改，对齐分为三个层级：

| 层级 | 目标 | 保留的 demo 特性 |
| --- | --- | --- |
| L1：侵蚀核心等价 | 在相同 `baseShape/detail/coverage/height/type` 输入下，Billowy/Wispy 核心输出与 HP 数值一致 | 现有 weather support、多层、hero、距离 fade 可继续包在外层 |
| L2：HP 低云语义等价 | 对齐 coverage 双路、Cu/Tcu/Cb、底平滑、detail 4 通道、LUT/高度、Sc 与密度后处理 | 可保留多层/hero 作为显式扩展，但不得悄悄改变 HP 核心输入 |
| L3：HP 云族覆盖 | 增加独立 Ac/As 高空云 evaluator 及相应 2D 资源语义 | 保留 demo 的 WebGPU 渲染器、GUI、调试视图与步进策略 |

首要交付应是 L1；L2、L3 分开推进。不要在一个提交里同时改 weather、detail 通道、profile 和最终 density scale。

## 6. 分阶段实施路线图

### 阶段 0：冻结基线与建立可观测性

- [x] 固定至少四个相机/天气预设：侧视 Cu、斜视 Cb、正俯视、detail-off。
- [x] 保存当前 Final、Support、AfterShape、FinalDensity 截图及参数 JSON。
- [x] 增加纯数值 debug 输出或小型 CPU reference test，覆盖 `densityRemap`、阈值、wispy reach、混合和底部 fade。
- [x] 明确对齐模式开关，例如 `densityModel = current | hpCore | hpLowCloud`；在 L2 完成前保留 `current` 回退路径。

验收：能判断一次改动发生在 weather/support、shape、detail、threshold 还是 post-density，而不是只看最终彩图猜原因。

### 阶段 1：先实现 L1 的参数和公式等价

- [x] 把 demo 的 `densityThreshold`、`wispyReach`、`edgeSoftness`、`wispyTopHeight`、`wispyTopHardness` 与 `bottomSmoothHeight/Pow` 拆成独立参数。
- [x] 在 `hpCore` 路径中移除隐式耦合：`wispyReach = edgeWidth*0.9`、blend width 的 0.08 下限、写死的 0.55/2.2、type 驱动 edge softness。
- [x] 明确 remap 边界约定：推荐保留 WebGPU 安全分母，但测试应验证常规域内与 HP `saturate(DensityRemap(...))` 一致；对 `low >= 1` 规定返回 0，避免 NaN。
- [x] 暂时保留 demo 的 `detailFade`，但把它定义为核心外部的采样质量权重，确保设为 1 时可做 HP 数值对照。
- [x] 暂时关闭 demo 特有 `topW` detail 加成和 type 线性加成，或放到 `current` 路径中。

验收：给定固定标量输入的 CPU reference 与 WGSL 公式误差不超过 `1e-5`；`detail=0` 时 Billowy/Wispy 均退化到相同 base path。

### 阶段 2：拆开 support coverage 与 HP density coverage

- [x] 将当前 `cov` 重命名为 `supportCoverage`，避免继续把它误认为 HP coverage。
- [x] 直接从 weather R 读取独立 `densityCoverageRaw`；不要从已经混入 G/meso 的 `coverageSignal` 旁路。`coverageSignal` 只保留给 current/support 路径。
- [x] 添加 HP 风格 Cover contrast/intensity；另设 Height contrast/intensity，为后续 cloud-top 变换预留。
- [x] `cloudFromShape`/新 `hpLowCloudCore` 只接收 `densityCoverage`，阈值使用 `(1-densityCoverage)+densityThreshold`。
- [x] 保留 `supportCoverage` 供原有 debug、空域提示或 current 模式使用；确认它不再暗中进入 HP 核心。
- [x] 加入与 HP `CLOUD_DENSITY_TRESHOLD=0.1` 对应的低云 coverage 门控测试；若要测试整个函数早退，必须固定 `needHighCloud=false`。

验收：扫描 raw coverage 从 0 到 1 时，阈值和最终密度曲线与 HP reference 同向且断点一致；改变 support filter width 不再改变 `hpCore` 的 density coverage。

### 阶段 3：对齐 base shape 与 detail 资源语义

- [x] 为 shape 增加 `hpRChannelOnly` 路径；保留现有 RGB blend 作为 current 模式。
- [x] HP 路径按 `pow(abs(r),0.6)` 处理 R；若为了数值稳健保留 demo 的 `max(1e-4,...)` 底值，必须标成有意偏差并纳入零值测试。
- [x] 将 scale 从标量扩为 `vec3`，显式区分 base/detail offset、水平风倍率和 detail 垂直风。
- [x] 决定并记录 Y 翻转策略；HP 模式使用 `(x,-y,z)`，current 模式保持现状。
- [x] detail generator 增加 `R=WispyLow, G=WispyHigh, B=BillowyLow, A=BillowyHigh` 的 HP 布局。为兑现 current 回退，迁移期必须使用双资源或版本化 layout；不能直接覆盖唯一纹理后仍声称 current 可逐像素回归。
- [x] 添加四个 detail blend weight，并按 HP 分别合成 Billowy/Wispy。
- [x] 纹理布局迁移必须与 shader 消费在同一阶段完成，禁止出现“新资源 + 旧 swizzle”的中间提交。
- [x] 明确本阶段只保证通道/频率角色对齐，还是要求噪声场视觉等价；若后者成立，需要 HP 等价源资产或经许可的生成方法，当前 Worley generator 只能算近似。

验收：四通道逐一置 1、其余置 0 时，debug 能明确显示每个通道只进入预期分支；关闭 high 权重时可退化为两通道结果。

### 阶段 4：对齐 Cu/Tcu/Cb、底部高度与 profile

- [x] 把当前单段 Cu↔Cb `typeMix` 扩为 Cu→Tcu→Cb 两段插值，并定义 weather type 编码。
- [x] 添加三组 detail strength 与三组 type density multiplier。
- [x] 先建立可生成/可加载的 CloudLut，并支持 Cu/Tcu/Cb RGB 通道；解析 profile 保留为 fallback/debug 对照。
- [x] 实现 HP coverage 驱动的底部锚定云顶拉伸，得到 `heightForLUT`。
- [x] bottom fade 改用最终 `localHeight`；wispy top mask 仍按 HP 的全局 normalized height，二者不要混用。
- [x] 明确是否复制 LUT 的 `radialDist` 维度。若 demo 不需要有限天气图中心语义，应把它记录为有意偏差，而不是声称完全等价。

验收：type 取 0、0.5、1 时分别命中 Cu、Tcu、Cb 参数；coverage 拉伸不抬高云底；LUT 与解析 fallback 可并排显示。

### 阶段 5：增加 Sc，但与普通低云分开验收

- [x] 重新定义或扩充 weather 数据，提供独立 Sc mask；当前 B 已被 Cu/Cb type 占用，不能直接照抄 HP swizzle。
- [x] 增加 Sc coverage contrast/intensity、height scale、detail strength、cell scale/noise/thickness 参数。
- [x] 实现 Sc coverage 空隙、localHeight 压缩、LUT R 通道混合和最终 `heightClip`。
- [x] Sc 关闭时必须与阶段 4 的低云结果完全一致。

验收：Sc mask=0 为逐像素无变化；mask=1 时形成压扁薄层和细胞间隙，且 detail strength 可独立于 Cu/Tcu/Cb 调节。

### 阶段 6：对齐低云 density 后处理与输出范围

- [x] 添加全局 density multiplier 与 Cu/Tcu/Cb multiplier 的明确顺序。
- [x] 低云 darkness modulation 严格以 `densityCoverage` 调用 `HP_HI_A_DENSITY_SCALE` 等价公式；不要因宏名含 `HI_A` 而改传 Hi A。
- [x] Hi Weather A 仅接入低云 `edgeSoftness` 路径；若 demo 尚无该输入，先用显式常量或独立纹理，不要复用无关通道。
- [x] 移除 HP 模式核心中的 `min(1, ...)`，允许倍率产生大于 1 的密度；只在需要显示的 debug view clamp。
- [x] 将 camera distance fade 和 raymarch `typeW` 明确标成核心外部策略，数值对齐测试时设为 1。

验收：关闭所有扩展倍率时退化为阶段 4/5 输出；大于 1 的密度不会被 shader 核心截断，最终光学积分仍保持有限且无 NaN。

### 阶段 7：补齐 LOD 与 simple mode

- [x] 为 3D shape/detail 纹理生成 mip chain，或记录 WebGPU 侧采用的等效预滤波方案。
- [x] 将 `noiseMipOffset`、`erosionMipOffset` 显式传入 evaluator。
- [x] 增加 `simpleMode`，粗探测时跳过 detail；保留 step-length `detailFade` 作为抗闪烁扩展，但不要把它称为 HP mip LOD。
- [x] 比较固定 LOD、mip LOD、detailFade 三种方式的稳定性和 GPU 时间。

实现记录：shape、current detail 与 HP detail 均生成完整 3D box-filter mip chain；HP evaluator 使用独立 shape/detail LOD，raymarch 的 probe/ahead 路径使用 `simpleMode`，最终密度与光照采样仍使用完整模式。固定验证场景中，阶段 7 的 `current` LOD 0 截图与阶段 0 基线字节一致；HP 的 LOD 2 与强制 simple 截图均已保存且无 WGSL/WebGPU 错误。WebGPU timestamp-query 本机趋势值为固定 LOD 0 `81.553 ms`、mip LOD 2 `75.710 ms`、step detail fade `82.461 ms`；fixed 与 detail-fade 在当前步长范围内截图字节一致，mip LOD 2 会降低高频细节。具体记录见 evidence，不能外推为跨设备基准。

验收：远距/大步长下细节不闪烁；simple mode 不采样 detail；完整模式在 LOD 0 与阶段 6 近景基线一致。

### 阶段 8：实现独立 Ac/As 高空云路径（L3）

- [x] 新建独立 high-weather 通道与 evaluator，不复用低云 3D shape/detail。
- [x] 添加 cell、warp、wisp、coverage-driven top/bottom、horizon shift、band softness 和独立 density multiplier。
- [x] 主 raymarch 为高空云建立可独立调节的密度采样区间，再与低云结果合成；高空云光步属于后续光照路线图，不在本文实施范围内。
- [x] 原 demo 第三层可保留为通用 3D 层，但 UI 和命名必须与 HP high cloud 区分。

实现记录：高空云使用独立 high-weather（R coverage、G As/Ac type、A Hi-A/MS weight）、cell、RG warp 与 wisp 四张 2D 纹理；`evaluateHighCloudDensity` 不调用低云 3D shape/detail。高云使用独立球壳区间和均匀步进，按相机位于高云底部上下选择前后合成顺序，并提供 `HighWeather`、`HighBand`、`HighDensity` 调试视图。当前 demo 仅提供轻量高云自阴影近似，未宣称复刻 HP 的完整 HDRP 高云光照。

验收：关闭高空云路径时低云逐像素不变；Ac/As 不采样低云 shape/detail；高空云可单独 debug 和计时。

## 7. 建议的提交边界

每个提交只跨一个可验证边界：

1. debug/reference 基线；
2. 参数拆分，不改默认视觉；
3. HP 核心公式开关；
4. coverage 信号拆分；
5. shape R-only 与坐标开关；
6. detail RGBA 布局与消费原子迁移；
7. Cu/Tcu/Cb + LUT；
8. Sc；
9. density 后处理；
10. mip/simple mode；
11. Ac/As 独立路径。

每个提交至少运行：

```bash
npm run typecheck
npm run build
```

涉及视觉语义的提交还必须附固定参数、固定相机的 before/after 截图；涉及公式的提交附 CPU reference 扫描结果。

## 8. 完成定义

L1 完成需同时满足：

- 同输入下 remap、阈值、wispy mask、Billowy/Wispy mix 与 HP reference 一致；
- current 与 hpCore 可明确切换；
- 没有 NaN、support 外造云或纹理通道错接。

L2 完成需额外满足：

- coverage 双路、Cu/Tcu/Cb、bottom/local height、LUT、Sc、type/global density multiplier 和 density modulation 均有对照证据；
- 文档中列出的有意保留差异有明确开关或说明；
- 多层、hero、distance fade 不再污染 HP 核心数值测试。

L3 完成需额外满足：

- Ac/As 使用独立 2D evaluator 和资源语义；
- 低云、高空云可独立关闭、调试、计时和回归；
- README 更新最终通道布局、参数语义与许可归属。

## 9. 当前建议的下一步

阶段 0–8 已完成。`current` 与高云关闭时的 HP 低云均保留字节级截图回归；剩余工作属于调参、更多硬件上的性能采样，或不在本路线图范围内的完整高云光照模型。
