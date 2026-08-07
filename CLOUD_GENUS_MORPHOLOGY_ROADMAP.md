# cloud-sculpt-demo 十云属形态家族实施路线图

> 状态基线：2026-08-07。本文只规划云属密度形态及其直接依赖；太阳盘、日晕、闪电、降水等光学或天气特效单独列为后续工作。

## 1. 目标摘要

当前系统已经具备：

- `CloudBody` 独立对象管理、复制、删除、快照和生命周期；
- 十云属显式 GPU dispatcher；
- 每个体积云两个 `vec4`、共 8 个形态配方参数；
- Cu/TCu/Cb 的 HP LUT 基础、Sc 特殊路径以及 Ac/As 高云路径；
- 固定验证模式、密度调试视图、WebGPU 编译检查和 CPU 契约测试。

当前缺口是：十个属级 evaluator 仍主要调用同一个兼容密度核心，形态配方虽已进入 GPU context，但尚未参与密度计算。

本路线图的目标是形成以下结构：

```text
CloudBody
  -> CloudGenusDensityContext
  -> 十云属 dispatcher
      -> Cu / TCu / Cb：积状原语
      -> St / As / Ns / Cs：层状原语
      -> Sc / Ac / Cc：蜂窝块状原语
      -> Ci：纤维状原语
  -> DensitySample
  -> 现有光学积分
```

这里的“四个家族”是共享形态原语，不是四个替代十云属的粗粒度 shader。每个云属仍必须保留具名 evaluator、独立默认配方和独立验收证据。

## 2. 范围与非目标

### 2.1 本路线图包含

- 云体局部坐标和确定性形态相位；
- 安全、可回退的形态混合原语；
- 积状、层状、蜂窝块状和纤维状四类密度实现；
- 十云属逐属验收；
- CloudBody 配方、preset、快照和高级 GUI 的最小闭环；
- 密度数值、固定截图、WebGPU 编译和性能回归测试；
- `volume`、`local-volume`、`high-sheet` 三条路径的形态语义收口。

### 2.2 本路线图不直接实现

- Altostratus 的漫射太阳盘；
- Cirrostratus 的约 22° 冰晶日晕；
- Cumulonimbus 的内部闪电；
- Nimbostratus 的降水、雨幡和近地雾；
- 水滴与冰晶之间完整的属级相函数和消光差异；
- 气象模拟、湿度场、浮力流体或真实云微物理。

上述项目依赖形态稳定，但不应塞进 density evaluator，以免密度、光照和天气辅助场重新耦合。

## 3. 核心架构约束

### 3.1 十个属级入口必须保持显式

保留以下入口：

```wgsl
evaluateCumulusDensity
evaluateStratusDensity
evaluateStratocumulusDensity
evaluateCumulonimbusDensity
evaluateAltocumulusDensity
evaluateAltostratusDensity
evaluateNimbostratusDensity
evaluateCirrusDensity
evaluateCirrostratusDensity
evaluateCirrocumulusDensity
```

允许它们调用家族共享函数，但禁止 dispatcher 直接把 genus 映射成四个家族后丢失属级边界。

### 3.2 兼容密度是迁移桥，不是最终形态模型

`evaluateCompatibilityDensity()` 在迁移期间承担三种职责：

1. 为尚未迁移的云属提供现有画面；
2. 为乘法雕刻型家族提供安全 footprint 和垂直边界；
3. 为强度为 0 的回退路径提供可验证基线。

所有云属完成后，它可以继续作为共享 foundation，也可以缩减为通用 coverage/detail 原语，但不得继续隐式决定所有云属的垂直 profile。

### 3.3 家族函数必须满足零强度退化

建议统一使用以下形态：

```wgsl
fn applyFamilyMorphology(
  context: CloudGenusDensityContext,
  compatibility: DensitySample,
  strength: f32,
) -> DensitySample
```

约束：

- `strength == 0` 时输出应与输入相等；
- 输出 density 必须有限且不小于 0；
- 不得绕过 CloudBody 水平边界、生命周期或距离淡出；
- `simpleMode` 不得增加高频纹理采样；
- 新形态默认不得污染其他云属。

### 3.4 层状家族必须拥有独立 foundation

St、As、Ns、Cs 不能永久建立在 Cu profile 上再做乘法，因为乘法只能移除已有密度，不能填充连续云幕。

层状家族最终应使用：

```text
weather coverage
  x sheet vertical envelope
  x low-frequency macro variation
  x uniformity/opacity shaping
  - restrained erosion
```

这个 foundation 可复用现有 weather、shape 和 detail 资源，但垂直包络与密度阈值语义必须独立。

## 4. 当前 GPU 形态配方约定

现有两个 `vec4` 的语义保持稳定：

| GPU 通道 | CloudBody 字段 | 主要消费者 |
| --- | --- | --- |
| `morphology0.x` | `verticalDevelopment` | 积状高度、层厚、垂直起伏 |
| `morphology0.y` | `cellScale` | 对流单体、蜂窝单体、纤维宽度 |
| `morphology0.z` | `cellStrength` | 花椰菜或蜂窝结构强度 |
| `morphology0.w` | `sheetUniformity` | 云幕连续性和单体连接度 |
| `morphology1.x` | `fiberStrength` | 纤维化混合强度 |
| `morphology1.y` | `fiberAngleDeg` 的弧度值 | 纤维、条带或波纹主方向 |
| `morphology1.z` | `anvilStrength` | Cb 顶部砧云扩展 |
| `morphology1.w` | `erosionScale` | 家族级边缘破碎尺度 |

实施期间不再随意增加 raw 参数。只有当某个云属无法通过这 8 个语义表达，并且有固定证据说明原因时，才允许扩展快照和 GPU buffer。

## 5. 全局验证策略

每一个视觉切片都必须执行四层验证。

### 5.1 数值与契约测试

- 所有形态函数在代表性输入扫描中无 `NaN`、`Infinity` 或负密度；
- 强度为 0 时回到兼容输出，CPU reference 误差目标不超过 `1e-5`；
- 高度包络在 base/top 之外为 0；
- 旋转只改变方向，不改变统计密度总量；
- 同一 seed/时间/参数输出确定；
- 只修改目标云属时，其他属级入口契约不变。

### 5.2 Shader 与运行时测试

- `npm run build`；
- 全部 `node --test` 测试；
- 浏览器 WebGPU 编译无错误和警告；
- `validation=1` 最终进入 `renderReady=true`；
- GPU uniform buffer 尺寸和 WGSL struct 保持一致。

### 5.3 固定视觉证据

为每个云属建立至少三张固定图：

1. Final：最终光照结果；
2. FinalDensity：密度分布；
3. Support/AfterShape：区分覆盖、形态和侵蚀问题。

固定条件包括：

- 相机位置、朝向和 FOV；
- 太阳方位与高度；
- frozen time；
- weather/shape/detail seed；
- CloudBody 位置、尺寸、旋转和配方；
- 渲染质量、步数和 tone mapping。

### 5.4 性能验证

阶段 0 先记录同机基线，再采用相对预算：

- 单属固定场景：每个家族完成后 GPU 时间中位数增长暂定不超过 10%；
- 8 个 volume body 压力场景：最终增长暂定不超过 20%；
- `simpleMode` 不执行额外 detail 或多 octave 家族采样；
- 光照辅助密度采样不得无条件执行最高成本形态；
- 若超过预算，先增加距离/步长 LOD，不通过降低默认截图质量掩盖。

## 6. 阶段 0：冻结十云属基线

目标：在改动任何形态前建立可比较、可复现的证据。

### 任务

- [ ] 为十云属建立 canonical CloudBody fixture；
- [ ] TCu 作为 Cu 的发展阶段，额外建立 `cumulusDevelopment=0.65` fixture；
- [ ] 每个 fixture 只启用一个目标云体，避免多层抢占；
- [ ] 增加 8-body 混合压力 fixture；
- [ ] 记录 Final、FinalDensity、Support 和 AfterShape；
- [ ] 记录每个 fixture 的 CloudBody snapshot JSON；
- [ ] 记录支持 timestamp query 时的 GPU 时间；
- [ ] 建立证据目录和命名约定。

建议命名：

```text
docs/evidence/genus-morphology/stage0/cumulus-final.png
docs/evidence/genus-morphology/stage0/cumulus-density.png
docs/evidence/genus-morphology/stage0/cirrus-after-shape.png
docs/evidence/genus-morphology/stage0/fixtures.json
docs/evidence/genus-morphology/stage0/gpu-timing.json
```

### 验收

- 同一 fixture 连续渲染结果确定；
- 能单独观察十个云属及 TCu；
- 当前 75 项测试和生产构建继续通过；
- 形成后续所有阶段共同使用的 before 基线。

## 7. 阶段 1：云体局部形态坐标

目标：补齐所有家族共享的空间输入，但不改变任何像素。

### 7.1 Context 扩展

在 `CloudGenusDensityContext` 中增加或派生：

- `bodyIndex: u32`；
- `bodyLocalMeters: vec3f`；
- `bodyLocalUnit: vec3f`；
- `normalizedHeight: f32`；
- `bodyPhase: vec3f`；
- 可选的 `horizontalAspect: vec2f`。

### 7.2 坐标语义

`bodyLocalMeters`：

- 原点位于 CloudBody 中心和 base；
- XZ 应用 CloudBody rotation 的逆旋转；
- Y 保持米制高度；
- 风平移和 morph transport 在进入局部坐标前完成。

`bodyLocalUnit`：

- X/Z 按 radius 归一化；
- Y 按 `topM-baseM` 归一化；
- 无界云层使用稳定的世界尺度，不用极大 radius 制造近零坐标。

`bodyPhase`：

- 由 body index、中心和固定常量确定性派生；
- 不依赖帧时间；
- 用来避免多个同属云体共享完全相同的细胞或纤维相位。

### 7.3 测试

- [ ] 零旋转时局部 XZ 与中心偏移一致；
- [ ] 90° 旋转时轴向正确交换；
- [ ] bounded/unbounded 坐标均有限；
- [ ] 同一输入的 phase 确定；
- [ ] 只增加 context 时 stage 0 截图逐像素不变。

### 验收

所有属级 evaluator 仍调用兼容核心，stage 0 全部像素不变，WebGPU 编译通过。

## 8. 阶段 2：共享形态安全原语

目标：建立四个家族可复用、可单测的数学工具，默认仍不改变画面。

### 任务

- [ ] `replaceSampleDensity(sample, density)`：保留 support/type/height 元数据；
- [ ] `safeMorphBlend(base, shaped, strength)`：强度 0 精确退化；
- [ ] `verticalBand(h, bottomSoft, topSoft)`；
- [ ] `rotateMorphologyXZ(position, angle)`；
- [ ] `anisotropicCoordinate(position, scale)`；
- [ ] 低成本 cellular carrier；
- [ ] 低成本 ridge/fiber carrier；
- [ ] sheet macro variation；
- [ ] 距离和 stepLen 驱动的形态 LOD；
- [ ] simple mode 快速路径。

第一版优先复用现有 `shapeTex`、`hpDetailTex`、`scCellTex` 和高云 cellular 资源，不立即引入新纹理。只有现有资源无法满足频谱或方向性时，才单独规划资源阶段。

### 验收

- 每个 helper 有 CPU reference 或源码契约测试；
- 关闭所有家族强度时 stage 0 逐像素不变；
- simple mode 不增加高频纹理读取。

## 9. 阶段 3：积状家族 Cu / TCu / Cb

积状家族优先复用现有 Cu/TCu/Cb LUT、type density 和 detail 语义。

### 9.1 Cu：配方接管但保持基线

目标特征：平底、圆顶、离散蓬松单体。

任务：

- [ ] `evaluateCumulusDensity()` 显式调用积状家族函数；
- [ ] `verticalDevelopment` 控制圆顶高度，但当前默认保持接近现有 Cu；
- [ ] `cellScale` 控制单体尺度；
- [ ] `cellStrength` 从 0 到 1 混合花椰菜结构；
- [ ] `erosionScale` 只调整家族侵蚀尺度，不替代全局 detail amount；
- [ ] Cu 不读取 `anvilStrength` 和 `fiberStrength`。

验收：

- 默认 Cu 与 stage 0 构图、底部和覆盖基本一致；
- 增加 cellStrength 时只改变内部单体和轮廓，不抬升云底；
- cellStrength=0 回到兼容 Cu。

### 9.2 TCu：作为 Cu 的连续发展阶段

TCu 不是第十一个 genus，继续由 `genus=cumulus` 和 `cumulusDevelopment` 表达。

任务：

- [ ] 发展度连续提高垂直包络；
- [ ] 发展度连续增强纵向拉长的对流单体；
- [ ] 保持 Cu 与 TCu 之间无跳变；
- [ ] 发展度不启用 Cb 砧云；
- [ ] `verticalDevelopment` 作为艺术倍率，而不是替代发展度。

验收：

- 扫描 development 0–1 时高度、单体强度连续；
- 没有中间值密度突然消失或爆亮；
- development=0 与 Cu 基线一致。

### 9.3 Cb：对流塔体与砧云

目标特征：巨大垂直发展、花椰菜塔体、暗底、顶部砧云。

任务：

- [ ] 增加垂直拉长的 macro/detail convective cells；
- [ ] 只在中上部增强 cauliflower lobes；
- [ ] 保留较弱 scaffold，允许 cell valley 雕刻光滑穹顶；
- [ ] `anvilStrength` 只在高层 band 扩大水平 footprint；
- [ ] 砧云扩展必须遵守 CloudBody bounds feather；
- [ ] simple mode 使用低频 cell carrier；
- [ ] 光照采样使用简化 Cb 形态，避免二次高成本采样。

参考方向：`procedural-clouds-heli/shaders/genus/cumulonimbus.wgsl`。

验收：

- Cb 与 TCu 在同一机位下具有明确可辨的塔体和砧部；
- anvilStrength=0 不改变低中部密度；
- cellStrength=0 保留兼容 Cb；
- Cu、TCu 截图不因 Cb 实现变化。

## 10. 阶段 4：层状家族 St / As / Ns / Cs

本阶段风险最高，按“foundation 关闭 -> 单属启用”的方式推进。

### 10.1 独立 Sheet Foundation

任务：

- [ ] 新增 `evaluateSheetFoundation(context, recipe, profile)`；
- [ ] 直接从 weather coverage 建立连续宏观云幕；
- [ ] 使用独立上下边缘柔化；
- [ ] `sheetUniformity` 在 weather coverage 和均匀幕之间插值；
- [ ] 使用低频 shape variation 防止完全平板；
- [ ] erosion 只雕刻边缘和底部，不把云幕重新打成积云；
- [ ] 增加 family strength 为 0 的兼容回退，调试稳定后再移除临时开关；
- [ ] 不复用 Cu LUT 作为最终垂直 profile。

验收：

- foundation strength=0 与 stage 0 一致；
- strength=1 能生成连续云幕；
- coverage=0 时严格无密度；
- 不产生无限水平密度或天气图边缘硬切。

### 10.2 St：低而柔软的均匀层云

任务：

- [ ] 低层薄片垂直 profile；
- [ ] 高 sheetUniformity、低 cellStrength；
- [ ] 顶底柔化，底部只保留缓慢起伏；
- [ ] 限制 detail 侵蚀，避免形成花椰菜轮廓。

验收：低、薄、连续、柔软，与 Sc 的块状间隙明确区分。

### 10.3 As：中层透光薄幕

任务：

- [ ] 中层宽阔薄幕；
- [ ] 保持较低体密度和缓慢宏观变化；
- [ ] 为后续 diffuse sun disc 输出稳定的 density/optical depth；
- [ ] 与现有 high-sheet As 路径建立相同配方语义。

验收：密度形态是连续薄幕；太阳盘效果不作为本阶段通过条件。

### 10.4 Ns：厚重连续雨层

任务：

- [ ] 增厚垂直 profile；
- [ ] 高 uniformity 与较高密度；
- [ ] 底部使用低频破碎和下垂感；
- [ ] 保持顶部相对平缓；
- [ ] 为后续 precipitation field 预留稳定底部 mask，但不在 density 中生成雨线。

验收：与 As 相比明显更厚、更暗、更连续；无降水时仍能独立成立。

### 10.5 Cs：极薄高空冰晶幕

任务：

- [ ] 极薄垂直 profile；
- [ ] 高 uniformity、低 density；
- [ ] 只保留非常弱的方向性纤维扰动；
- [ ] 为后续 halo optical signature 提供平滑 optical-depth 背景。

验收：与 Ci 的长纤维、Cc 的细颗粒均明确区分；日晕不作为本阶段通过条件。

## 11. 阶段 5：蜂窝块状家族 Sc / Ac / Cc

共享 cellular 原语，但每个云属使用不同尺度、连通度和垂直包络。

### 11.1 抽出现有 Sc Cellular

任务：

- [ ] 把当前 Sc 的高度压缩、coverage 和 cell factor 拆成具名 helper；
- [ ] 第一小步保持当前 Sc 像素结果；
- [ ] cell 采样改用 CloudBody 局部坐标；
- [ ] `cellScale` 控制频率；
- [ ] `cellStrength` 控制 cell 可见度；
- [ ] `sheetUniformity` 控制单体连接程度；
- [ ] 保留 weather B mask 的现有语义，直到 body-local macro field 独立阶段。

验收：重构前后默认 Sc 像素一致；改变配方时只影响目标 Sc body。

### 11.2 Sc：大单体、相连云毯

任务：

- [ ] 低频大 cell；
- [ ] 中高连接度；
- [ ] 明显间隙但不完全分离；
- [ ] 压扁垂直 profile；
- [ ] 支持 roll/patch 方向变化。

验收：与 St 的连续软幕明确区分，且不是扁平 Cu。

### 11.3 Ac：中尺度分离云团

任务：

- [ ] 中等 cell 频率；
- [ ] 降低连接度，形成 mackerel-sky cloudlets；
- [ ] 使用轻度 warp 避免规则蜂窝；
- [ ] volume Ac 与 high-sheet Ac 使用同一配方解释；
- [ ] 不再依赖只有高云特殊路径才能看出 Ac 特征。

参考方向：`procedural-clouds-heli/shaders/genus/altocumulus.wgsl`。

验收：Ac 的单体尺度明显小于 Sc、大于 Cc，且高度和密度符合中层云。

### 11.4 Cc：高频细颗粒与波纹

任务：

- [ ] 比 Ac 更高的 cellular 频率；
- [ ] 更薄垂直 profile；
- [ ] 加入弱方向 ripple，但不演变成 Ci 纤维；
- [ ] 使用 LOD 防止远距闪烁和摩尔纹；
- [ ] simple mode 降为单次低频 cellular。

参考方向：`procedural-clouds-heli/shaders/genus/cirrocumulus.wgsl`。

验收：固定俯视与斜视图中均表现为细小鱼鳞/颗粒，不出现规则棋盘或远距闪烁。

## 12. 阶段 6：纤维状家族 Ci

Ci 是唯一纯纤维家族，但仍保留独立 evaluator 和配方。

### 12.1 坐标与主方向

任务：

- [ ] 按 `fiberAngle` 旋转 body-local 坐标；
- [ ] 长轴低频、横轴高频，建立各向异性域；
- [ ] 使用低成本 curl/domain warp 弯曲主轴；
- [ ] body rotation 和 fiberAngle 语义分离：前者旋转云体，后者旋转内部纤维。

### 12.2 纤维提取

任务：

- [ ] 使用 ridge/carrier 提取宽纤维；
- [ ] 叠加低权重细丝和分叉；
- [ ] `fiberStrength` 控制兼容密度与纤维密度混合；
- [ ] `cellScale` 控制纤维宽度；
- [ ] `erosionScale` 控制断裂和尾迹；
- [ ] 极薄垂直 envelope；
- [ ] 限制增强值，避免细丝产生不合理高密度。

参考方向：`procedural-clouds-heli/shaders/genus/cirrus.wgsl`。

### 12.3 LOD 与稳定性

任务：

- [ ] 远距逐步降低细丝频率；
- [ ] 大 stepLen 时只保留宽纤维；
- [ ] 光照密度采样使用宽纤维近似；
- [ ] 动画只缓慢改变 curl，不让纤维方向逐帧跳变。

验收：Ci 具有长、窄、弯曲、分叉的结构；与 Cs 薄幕、Cc 颗粒明确区分；远距无明显闪烁。

## 13. 阶段 7：特殊渲染路径语义收口

当前 CloudBody 包含 `volume`、`local-volume` 和 `high-sheet` 三条路径。最终必须明确谁是 canonical 实现。

### 决策

- 十云属 canonical 密度形态以 `volume + genus dispatcher` 为准；
- `local-volume` 是局部 hero/近景优化，不定义另一套 Cb 形态语言；
- `high-sheet` 是 Ac/As 的专用性能或远景路径，不定义另一套 Ac/As 配方含义；
- 同一 CloudBody 配方在不同路径下允许质量差异，不允许语义相反。

### 任务

- [ ] local-volume 消费 Cb 的 vertical/cell/anvil 配方；
- [ ] high-sheet 消费 Ac/As 的 cell/sheet/erosion 配方；
- [ ] 明确哪些参数在特殊路径中被近似或忽略；
- [ ] GUI 标注渲染路径，不让用户误认为是额外云属；
- [ ] 对 canonical volume 与特殊路径建立并排截图；
- [ ] 若特殊路径不再提供明显价值，单独规划删除，不在形态提交中顺手移除。

### 验收

切换路径时云属身份、配方和大尺度视觉意图保持一致；不存在旧槽位或隐藏 type slider 重新成为真实来源。

## 14. 阶段 8：Preset 与 GUI 收口

形态算法稳定前，不把 8 个 raw 参数全部暴露给普通 GUI。

### 14.1 普通模式

每个家族最多暴露 2–4 个艺术控制：

| 家族 | 普通控制建议 |
| --- | --- |
| 积状 | 垂直发展、云团大小、蓬松度、砧云 |
| 层状 | 云幕连续性、厚度、底部破碎 |
| 蜂窝 | 单体大小、连接度、间隙强度 |
| 纤维 | 纤维强度、方向、宽度、卷曲/破碎 |

只显示当前 genus 相关控制，避免 GUI 再次堆满不适用参数。

### 14.2 高级模式

- [ ] 可查看全部 8 个 recipe 值；
- [ ] 字段提供中英文说明；
- [ ] 显示“默认配方/已自定义”状态；
- [ ] 提供“重置当前云属形态”操作；
- [ ] 切换 genus 时明确是加载默认配方还是保留自定义值；
- [ ] snapshot 导入后刷新控制器但不重置配方。

### 14.3 Preset

- [ ] 每个 canonical genus 至少有一个验证 preset；
- [ ] 场景 preset 可覆盖 genus 默认配方，但必须显式记录差异；
- [ ] preset 不直接写 GPU offset；
- [ ] preset 应操作 CloudBody，而不是重新引入全局 type/slot adapter。

### 验收

普通 GUI 只显示当前云属有意义的少量控制；高级 GUI 可完整复现 snapshot；语言切换后标签、说明和 folder 状态一致。

## 15. 阶段 9：十云属最终校准

### 15.1 形态验收矩阵

| 云属 | 必须可辨识的密度特征 | 不属于本阶段的特效 |
| --- | --- | --- |
| Cu | 平底、圆顶、蓬松单体 | 无 |
| TCu | 连续发展的高塔、增强对流单体 | 无 |
| Cb | 巨大塔体、花椰菜、砧云 | 闪电、降水 |
| St | 低、薄、柔软、连续 | 雾化地景 |
| As | 中层透光薄幕 | 漫射太阳盘 |
| Ns | 厚、暗、连续、破碎底部 | 雨幡、降水、近地雾 |
| Cs | 高、极薄、均匀冰晶幕 | 22° 日晕 |
| Sc | 大块相连、存在间隙的低层云毯 | 无 |
| Ac | 中尺度分离云团、鱼鳞天空 | 无 |
| Cc | 高频细颗粒和波纹 | 无 |
| Ci | 长纤维、弯曲、分叉、钩状尾迹 | 冰晶专属光学 |

### 15.2 参数校准原则

- 默认配方先追求属级可辨识，再追求气象尺度精度；
- 所有尺度参数必须结合 CloudBody 世界尺寸解释，避免不同 body 大小时完全失真；
- 高度和水平范围继续以 `GENUS_PLACEMENT_DEFAULTS` 为放置基线；
- morphology 默认值必须有固定截图证据；
- 不以提高曝光、密度倍率或 tone mapping 掩盖形态不足；
- 不为单张视角过拟合，至少检查侧视、斜视和俯视。

### 验收

不查看 GUI 标签时，十个 canonical fixture 在其主要识别视角下可由观察者区分；密度调试视图也能体现差异，而不是只靠颜色或高度区分。

## 16. 建议的提交边界

每个提交只跨一个可验证边界：

1. 十云属 fixture 与 stage 0 证据；
2. body-local 坐标，零视觉变化；
3. 共享安全 helper，零视觉变化；
4. Cu 接入积状家族；
5. TCu 连续发展；
6. Cb 对流单体；
7. Cb 砧云；
8. sheet foundation，默认关闭；
9. St；
10. As；
11. Ns；
12. Cs；
13. Sc helper 抽取，像素保持；
14. Sc 配方控制；
15. Ac；
16. Cc；
17. Ci 主方向与宽纤维；
18. Ci curl、分叉和 LOD；
19. local-volume/high-sheet 语义收口；
20. 普通 GUI 家族控制；
21. 高级 GUI、重置和中英文说明；
22. 十云属最终校准和证据归档。

视觉提交必须包含：

- 目标 fixture 的 before/after；
- 非目标云属的无变化证据；
- 对应密度调试视图；
- 测试、构建和 WebGPU 编译结果；
- 同机 GPU 时间对比。

## 17. 风险与缓解

### 17.1 形态只做乘法，层云仍像扁积云

缓解：层状家族使用独立 sheet foundation，不把 Cu profile 当最终基础。

### 17.2 多个云体共享相同噪声相位

缓解：引入确定性 body phase，并使用 body-local 坐标；不依赖可变对象顺序作为唯一 seed。

### 17.3 细胞和纤维采样显著增加 GPU 成本

缓解：先用解析 carrier 和已有纹理；按 stepLen、距离和 simpleMode 降级；光照路径使用低频近似。

### 17.4 GUI 再次失控

缓解：普通模式只显示当前家族少量控制，raw recipe 仅在高级模式显示。

### 17.5 特殊高云路径与 volume 形态分叉

缓解：以 volume dispatcher 为 canonical，特殊路径只做同配方的近似实现。

### 17.6 为了视觉效果破坏 HP 密度基础

缓解：兼容核心、家族形态和最终光学保持分层；每次提交固定 debug 阶段，禁止用后处理补偿密度错误。

### 17.7 默认参数被误认为物理校准值

缓解：在最终十属证据完成前，将 recipe 标记为艺术默认；气象高度参考与形态视觉校准分开记录。

## 18. 完成定义

本路线图完成需同时满足：

- 十个属级 evaluator 均不再只是无条件调用兼容密度；
- TCu 作为 Cu 的连续发展阶段，无离散跳变；
- 四个家族有明确共享原语，但十个 genus 仍保持显式入口；
- St/As/Ns/Cs 使用独立层状 foundation；
- Sc/Ac/Cc 在尺度和连接度上可辨；
- Ci 使用方向性纤维场，不再呈现积云式团块；
- Cb 具有对流单体和砧云形态；
- 所有 recipe 均从 CloudBody 经 GPU buffer 到达实际消费者；
- 旧 snapshot 迁移、复制和 genus reset 保持正确；
- 普通 GUI 不暴露无关参数，高级 GUI 有完整中英文说明；
- 十云属固定 Final/Density/Support/AfterShape 证据齐全；
- 全部测试、构建和实际 WebGPU 验证通过；
- 8-body 场景性能在记录的相对预算内；
- 太阳盘、日晕、闪电和降水被明确留在后续光学/天气路线图，而非伪装成密度实现。

## 19. 当前进度

- [x] CloudBody 独立对象管理；
- [x] 旧运行时槽位依赖移除；
- [x] 十云属显式 density dispatcher；
- [x] 每 CloudBody 两个 `vec4` 的 GPU morphology recipe；
- [x] snapshot v3 与 v1/v2 迁移；
- [x] 当前测试、构建和 WebGPU buffer 验证；
- [ ] 阶段 0：十云属视觉基线；
- [ ] 阶段 1：body-local 形态坐标；
- [ ] 阶段 2：共享安全原语；
- [ ] 阶段 3：积状家族；
- [ ] 阶段 4：层状家族；
- [ ] 阶段 5：蜂窝块状家族；
- [ ] 阶段 6：纤维状家族；
- [ ] 阶段 7：特殊路径语义收口；
- [ ] 阶段 8：Preset 与 GUI 收口；
- [ ] 阶段 9：十云属最终校准。

## 20. 下一步

下一次实现只执行阶段 0 和阶段 1 的第一小步：

1. 建立十云属和 TCu 的 canonical fixture 数据；
2. 固定截图与 GPU timing 命名；
3. 给 context 增加 `bodyIndex`、局部米制坐标和 normalized height；
4. 不让任何 evaluator 消费这些新增字段；
5. 用逐像素对比证明画面没有变化；
6. 通过后再开始 Cu 的第一个积状形态切片。

