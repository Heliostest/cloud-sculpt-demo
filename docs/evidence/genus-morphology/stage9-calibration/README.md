# 阶段 9：云属最终校准证据

采集日期：2026-08-09。固定入口均使用 `validation=1`，冻结时间为 6 秒。

## 状态

阶段 9 已完成除 Ci（卷云）以外的校准、三视角检查与四类调试证据归档。Ci 按阶段 6 的既有决定保持“未完成、暂时跳过”，因此阶段 9 整体状态仍是**部分完成**，不会虚标为十云属全部验收。

| Fixture | Preset | 主视角 | 结果 |
| --- | --- | --- | --- |
| Cu | `side-cu` | side | 通过：平底、圆顶、低层独立单体 |
| TCu | `oblique-tcu` | oblique | 通过：连续发展的高塔，与 Cu 明确区分 |
| Cb | `oblique-cb` | oblique | 通过：巨大塔体、花椰菜与砧云 |
| St | `genus-stratus` | side | 通过：低、薄、连续软幕 |
| Sc | `stratocumulus-sheet` | oblique | 通过：低层相连云毯，保留大块间隙 |
| Ac | `genus-altocumulus` | top | 通过：中尺度分离云团 |
| As | `genus-altostratus` | side | 通过：中层连续薄幕 |
| Ns | `genus-nimbostratus` | side | 通过：比 As 更厚、更暗、更连续 |
| Cs | `genus-cirrostratus` | side | 通过：极薄、均匀高空幕 |
| Cc | `genus-cirrocumulus` | top | 通过：薄层细颗粒；高太阳验证光照避免低角度自阴影伪装成条纹 |
| Ci | `cirrus-oblique` | oblique | 延期：沿用阶段 6 的未完成决定，不参与通过计数 |

## 目录

- `final/`：固定主视角的最终光照结果。
- `density/`：`FinalDensity`，确认形态来自密度而非颜色或光照。
- `support/`：CloudBody 有效范围。
- `after-shape/`：家族形态之后、最终侵蚀之前的密度。
- `views/side|oblique|top/`：每个非 Ci fixture 的三视角稳定性证据。
- `fixtures.json`：固定入口、视角和验收状态。
- `gpu-timing.json`：同机 timestamp-query 采样。

## 性能说明

本机单 Cu 固定场景为 6.070 ms；8 个 canonical volume body 压力场景为 130.359 ms，`simpleMode` 为 125.912 ms。压力场景已可复现，但没有阶段 0 的同场景历史计时，无法诚实计算“最终增长不超过 20%”；因此这里只记录测量值，不宣称性能预算通过。

## WebUI 复现

```text
/?preset=genus-cirrocumulus&validation=1
/?preset=stratocumulus-sheet&validation=1&debug=FinalDensity
/?preset=oblique-cb&validation=1&view=top
/?preset=eight-body-stress&validation=1
```

`view=side|oblique|top` 可覆盖 preset 主视角；`debug=Final|FinalDensity|Support|AfterShape` 可复现四类证据。
