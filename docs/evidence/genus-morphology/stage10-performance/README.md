# 阶段 10：多云体性能与交付硬化

日期：2026-08-09。

## 基线

阶段 9 同机 timestamp-query 记录：

| 场景 | GPU 时间 | 样本 |
| --- | ---: | ---: |
| 单 Cu `side-cu` | 6.070 ms | 16 |
| 8 volume body | 130.359 ms | 16 |
| 8 volume body + `simple=1` | 125.912 ms | 15 |

`simpleMode` 仅降低约 3.4%，说明主要成本不是最终视线 detail，而是每个 probe、主采样和光照采样反复遍历多个 CloudBody。

## 根因与修正

1. `evaluateLowCloud` 原先对每个启用 body 都执行 motion、天气图采样、局部坐标和 genus dispatcher，直到 evaluator 内部才发现高度不匹配。
2. 静态 body 的 `densityPos == worldPos`，但仍重复采样相同 weather texel。
3. `lowCloudLightOptics` 使用 `simpleMode=false`，与“光照只使用低频近似”的既有设计约束相反。
4. shader 固定循环 8 个槽位，没有消费 CPU 已知的实际 volume body 数量。

修正后：

- CPU 把实际 `volumeBodyCount` 写入 `debugFlags.w`，shader 在已打包体末尾提前结束；
- 每个世界采样只计算一次 altitude，在天气采样和 dispatcher 前按 body 的 base/top 严格拒绝；
- 静态 body 复用世界位置的 weather sample，只有移动或形变 body 才重新采样 transported weather；
- 低云光照采样使用已有 simple morphology 路径，保留 coverage、垂直 profile 和属级大形，同时跳过 detail erosion 与第二 cellular octave。

8-body fixture 在三个代表高度的昂贵候选数由固定 8 个变为 `4 / 3 / 3`。这是确定性的结构缩减，不是 GPU 时间估算。

## 回归保护

- source contract 锁定 altitude guard 必须早于 transported weather 采样；
- source contract 锁定 light probe 必须调用 `evaluateLowCloud(..., true)`；
- source contract 锁定 CPU body count 与两个 WGSL 循环的提前结束；
- motion/lifecycle 测试继续确保动态 body 使用 transported weather；
- 全量测试、TypeScript 和生产构建必须通过。

## WebGPU 复测

本轮自动浏览器访问本地验证页被环境安全策略拒绝，因此 after timestamp-query 保持待测，不填写推测值。可在 WebGPU 浏览器依次打开：

```text
/?preset=eight-body-stress&validation=1&bodyCount=1
/?preset=eight-body-stress&validation=1&bodyCount=2
/?preset=eight-body-stress&validation=1&bodyCount=4
/?preset=eight-body-stress&validation=1&bodyCount=8
```

等待 `document.body.dataset.gpuSampleCount` 达到 16，然后记录 `gpuMs`。页面同时暴露 `volumeBodyCount`，避免把 URL 目标数与实际启用数混淆。
