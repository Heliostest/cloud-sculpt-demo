export type Lang = 'en' | 'zh';

interface Copy {
  en: string;
  zh: string;
}

interface ParameterCopy {
  label: Copy;
  tip: Copy;
}

const copy = (en: string, zh: string): Copy => ({ en, zh });
const parameter = (en: string, zh: string, tipEn: string, tipZh: string): ParameterCopy => ({
  label: copy(en, zh),
  tip: copy(tipEn, tipZh),
});

const UI = {
  title: copy('Cloud Sculpt', '云雕刻'),
  language: copy('Switch the interface language.', '切换界面语言。'),
  viewMode: copy('Choose a compact or complete parameter view.', '选择简洁参数视图或完整参数视图。'),
  basicMode: copy('Compact', '简洁'),
  advancedMode: copy('Advanced', '高级'),
  helpHint: copy('Hover the ⓘ marks to see what each parameter changes.', '将鼠标悬停在 ⓘ 标记上可查看参数作用。'),
} as const;

const FOLDERS: Record<string, { label: Copy; tip: Copy }> = {
  bodyMorphology: { label: copy('Genus Shape', '云属形态'), tip: copy('The most useful artistic controls for the currently selected cloud genus.', '当前云属最常用且确实生效的艺术控制。') },
  bodyMorphologyAdvanced: { label: copy('Genus Recipe (8 values)', '云属配方（8 项）'), tip: copy('The complete morphology recipe stored by this cloud body and uploaded to the GPU.', '该云体保存并上传到 GPU 的完整形态配方。') },
  bodyMotion: { label: copy('Motion', '运动'), tip: copy('Independent horizontal transport and internal density variation for this volume body.', '该体积云独立的水平移动与内部密度变化。') },
  bodyLifecycle: { label: copy('Lifecycle', '生命周期'), tip: copy('Optional formation, mature, and dissipation timing for this volume body.', '该体积云可选的生成、成熟与消散时间。') },
  cloudBodies: { label: copy('Cloud Bodies', '云体'), tip: copy('Add, duplicate, remove, and edit independent cloud objects.', '添加、复制、删除并编辑独立云体。') },
  cloudBody: { label: copy('Cloud Body', '云体'), tip: copy('One editable cloud object backed by the current renderer.', '一个可独立编辑并连接到当前渲染器的云体对象。') },
  environment: { label: copy('Environment', '环境'), tip: copy('Wind, sun direction, and final exposure.', '风、太阳方向和最终曝光。') },
  diagnostics: { label: copy('Diagnostics', '诊断'), tip: copy('Intermediate visualizations for inspecting weather and density.', '用于检查天气图与密度的中间可视化。') },
  alignment: { label: copy('HP Alignment', 'HP 密度对齐'), tip: copy('Low-cloud density shaping aligned with the HP reference pipeline.', '与 HP 参考管线对齐的低云密度塑形参数。') },
  hpNoise: { label: copy('HP Noise', 'HP 噪声'), tip: copy('Large shape, detail erosion, advection, and channel mixing.', '控制大尺度形状、细节侵蚀、平流和噪声通道混合。') },
  hpTypes: { label: copy('HP Types / Profile', 'HP 云型 / 剖面'), tip: copy('Per-cloud-type detail and density response.', '按云型调整细节强度、密度以及顶部覆盖剖面。') },
  hpSc: { label: copy('HP Stratocumulus', 'HP 层积云'), tip: copy('Dedicated stratocumulus sheet and cellular pattern controls.', '层积云片层厚度、胞状结构与覆盖率控制。') },
  hpDensityPost: { label: copy('HP Density Post', 'HP 密度后处理'), tip: copy('Final remapping applied after the base density is assembled.', '基础密度组合完成后的最终重映射。') },
  hpLod: { label: copy('HP LOD', 'HP 细节层级'), tip: copy('Noise mip selection and distance-based detail simplification.', '噪声 Mip 选择和基于距离的细节简化。') },
  highCloud: { label: copy('HP High Cloud (Ac / As)', 'HP 中高云（高积云 / 高层云）'), tip: copy('Independent altocumulus and altostratus volume layer.', '独立的高积云与高层云体积层。') },
  highCell: { label: copy('Cell / Warp / Wisp', '胞状 / 扭曲 / 丝缕'), tip: copy('High-cloud cellular breakup, domain warp, and wispy detail.', '中高云的胞状分裂、域扭曲和丝缕细节。') },
  weather: { label: copy('Weather', '天气图与风'), tip: copy('World-space weather-map placement and wind direction.', '世界空间天气图的位置、范围和风向。') },
  sculpt: { label: copy('Sculpt', '细节雕刻'), tip: copy('High-frequency edge erosion used to sculpt the final silhouette.', '用于雕刻最终轮廓的高频边缘侵蚀。') },
  sun: { label: copy('Sun', '太阳'), tip: copy('Sun direction used by cloud and sky lighting.', '云层与天空照明使用的太阳方向。') },
  post: { label: copy('HP Sky / HDR Post', 'HP 天空 / HDR 后处理'), tip: copy('Sky gradient, exposure, tonemapping, and final color response.', '天空渐变、曝光、色调映射和最终色彩响应。') },
  zenith: { label: copy('Zenith RGB (linear)', '天顶 RGB（线性）'), tip: copy('Linear RGB color at the top of the sky.', '天空顶部的线性 RGB 颜色。') },
  horizon: { label: copy('Horizon RGB (linear)', '地平线 RGB（线性）'), tip: copy('Linear RGB color near the horizon.', '地平线附近的线性 RGB 颜色。') },
  hpLighting: { label: copy('HP Low-Cloud Lighting', 'HP 低云光照'), tip: copy('Phase scattering, multiple scattering, ambient light, and self-shadow response.', '相位散射、多重散射、环境光和自阴影响应。') },
  quality: { label: copy('Quality', '渲染质量'), tip: copy('Primary and light ray-march budgets. Higher values cost more GPU time.', '主光线与光照步进预算；数值越高，GPU 开销通常越大。') },
  camera: { label: copy('Camera', '相机'), tip: copy('Jump to useful cloud inspection viewpoints.', '快速切换到常用的云层观察视角。') },
};

const PARAMETERS: Record<string, ParameterCopy> = {
  morphologyStatus: parameter('Recipe Status', '配方状态', 'Shows whether all eight values still match this genus default recipe.', '显示全部八项数值是否仍与当前云属默认配方一致。'),
  genusMorphologyChange: parameter('On Genus Change', '切换云属时', 'Choose whether changing genus loads its defaults or carries the current custom values across.', '选择切换云属时加载新云属默认值，还是沿用当前自定义数值。'),
  resetMorphology: parameter('Reset Genus Shape', '重置当前云属形态', 'Restores all eight morphology values to the defaults of the current genus.', '将八项形态数值恢复为当前云属的默认配方。'),
  verticalDevelopment: parameter('Vertical Development', '垂直发展', 'Controls the authored vertical thickness or convective development of this genus.', '控制该云属的垂直厚度或对流发展程度。'),
  cellScale: parameter('Cell / Feature Scale', '单体 / 特征尺度', 'Scales cellular elements or the width of fiber features; larger values make broader structures.', '缩放胞状单体或纤维宽度；数值越大，结构越宽。'),
  cellStrength: parameter('Cell Strength', '单体强度', 'Controls how strongly cellular or cauliflower structure replaces the compatible base density.', '控制胞状或花椰菜结构替代兼容基础密度的强度。'),
  sheetUniformity: parameter('Sheet Uniformity', '片层均匀度', 'Connects neighboring cells and moves sheet genera toward a continuous cloud curtain.', '连接相邻单体，并让片层云属趋向连续云幕。'),
  fiberStrength: parameter('Fiber Strength', '纤维强度', 'Controls directional fibrous structure for genera that use it.', '控制会使用纤维结构的云属中的方向性丝缕强度。'),
  fiberAngleDeg: parameter('Fiber Direction (°)', '纤维方向（°）', 'Rotates internal fibers independently of the cloud body bounds.', '独立于云体边界旋转内部纤维方向。'),
  anvilStrength: parameter('Anvil Strength', '砧云强度', 'Expands the upper footprint of cumulonimbus; other genera intentionally ignore it.', '扩展积雨云上部砧状结构；其他云属会明确忽略该值。'),
  erosionScale: parameter('Erosion Scale', '侵蚀尺度', 'Adjusts genus-specific breakup and edge erosion without replacing the global detail amount.', '调整云属特有的破碎和边缘侵蚀，不替代全局细节量。'),
  path: parameter('Render Path', '渲染路径', 'Renderer implementation used by this cloud body; genus recipe meanings stay consistent across paths.', '该云体使用的渲染实现；不同路径仍共享一致的云属配方语义。'),
  windDeg: parameter('Body Wind Direction (°)', '单体风向（°）', 'Direction in which this cloud body is transported.', '这个云体整体移动的方向。'),
  windSpeedMps: parameter('Body Wind Speed (m/s)', '单体风速（m/s）', 'Horizontal transport speed of this cloud body.', '这个云体整体水平移动的速度。'),
  morphRate: parameter('Morph Rate', '形变速率', 'Rate of slow internal density-domain variation; zero keeps the authored shape stable.', '内部密度域缓慢变化的速率；设为零时保持原始形态。'),
  lifeEnabled: parameter('Enable Lifecycle', '启用生命周期', 'Starts this lifecycle when enabled; disable and enable again to restart it.', '启用时从头开始生命周期；关闭后再次启用可重新开始。'),
  lifeBirth: parameter('Birth (s)', '生成开始（秒）', 'Delay before the cloud begins to form.', '云体开始生成前的等待时间。'),
  lifeGrow: parameter('Full Growth (s)', '完全生成（秒）', 'Time when the cloud reaches peak density.', '云体达到峰值密度的时间。'),
  lifeDecay: parameter('Decay Start (s)', '消散开始（秒）', 'Time when the mature cloud begins to dissipate.', '成熟云体开始消散的时间。'),
  lifeDeath: parameter('Death (s)', '完全消失（秒）', 'Time when the cloud has fully dissipated.', '云体完全消散的时间。'),
  lifePeak: parameter('Peak Density', '峰值密度', 'Density multiplier during the mature lifecycle phase.', '生命周期成熟阶段的密度倍率。'),
  placementLocked: parameter('Keep Placement', '保留摆放', 'When enabled, changing the cloud genus keeps the hand-edited position and size.', '启用后，切换云属时保留手工调整的位置和尺寸。'),
  applyGenusDefaults: parameter('Apply Genus Placement', '应用云属摆放', 'Applies the recommended altitude and horizontal size for this cloud genus.', '应用该云属建议的高度和水平尺寸。'),
  cloudBody: parameter('Cloud', '云体', 'An independently editable cloud object.', '一个可独立编辑的云体对象。'),
  addCloud: parameter('Add Cloud', '添加云体', 'Adds another independent cloud body; this version supports up to ten.', '添加一个独立云体；当前版本最多支持十个。'),
  duplicateCloud: parameter('Duplicate', '复制', 'Copies this cloud into the next compatible render path.', '将这个云体复制到下一个兼容渲染路径。'),
  deleteCloud: parameter('Delete', '删除', 'Removes this cloud from the scene.', '从场景中删除这个云体。'),
  bounded: parameter('Local Bounds', '局部边界', 'Limits this deck to an editable horizontal ellipse.', '将这层云限制在一个可编辑的水平椭圆区域内。'),
  centerX: parameter('Center X (m)', '中心 X（米）', 'Horizontal center of this cloud body.', '这个云体的水平中心 X。'),
  centerZ: parameter('Center Z (m)', '中心 Z（米）', 'Horizontal center of this cloud body.', '这个云体的水平中心 Z。'),
  radiusX: parameter('Radius X (m)', '半径 X（米）', 'Ellipse radius along its local X axis.', '椭圆沿局部 X 轴方向的半径。'),
  radiusZ: parameter('Radius Z (m)', '半径 Z（米）', 'Ellipse radius along its local Z axis.', '椭圆沿局部 Z 轴方向的半径。'),
  rotationDeg: parameter('Rotation (°)', '旋转（°）', 'Rotates the horizontal ellipse around its center.', '让水平椭圆围绕中心旋转。'),
  feather: parameter('Edge Feather', '边缘羽化', 'Width of the soft density fade inside the ellipse edge.', '椭圆边缘向内柔和淡出的宽度。'),
  preset: parameter('Preset', '预设', 'Load a tuned parameter and camera configuration.', '加载一组已调校的参数与相机配置。'),
  densityThreshold: parameter('Density Threshold', '密度阈值', 'Raises or lowers the cutoff where low-cloud density becomes visible.', '调整低云密度开始可见的截断阈值。'),
  wispyReach: parameter('Wispy Reach', '丝缕延伸', 'Extends thin eroded detail beyond the dense cloud body.', '让细薄侵蚀细节延伸到致密云体之外。'),
  edgeSoftness: parameter('Edge Softness', '边缘柔度', 'Widens the density transition at cloud edges.', '加宽云边缘的密度过渡带。'),
  wispyTopHeight: parameter('Wispy Top Height', '丝缕顶部高度', 'Height where the upper wispy shaping becomes active.', '顶部丝缕塑形开始生效的归一化高度。'),
  wispyTopHardness: parameter('Wispy Top Hardness', '丝缕顶部硬度', 'Sharpness of the upper wispy height mask.', '顶部丝缕高度遮罩的锐利程度。'),
  bottomSmoothHeight: parameter('Bottom Smooth Height', '云底平滑高度', 'Height of the smooth, detail-reduced cloud-base band.', '云底平滑、弱细节区域的高度。'),
  bottomSmoothPow: parameter('Bottom Smooth Power', '云底平滑曲线', 'Curve exponent controlling how quickly bottom smoothing fades.', '控制云底平滑效果衰减速度的曲线指数。'),
  loCovCoverIntensity: parameter('Coverage Intensity', '覆盖强度', 'Scales low-cloud weather coverage before contrast remapping.', '在对比度重映射前缩放低云天气覆盖率。'),
  loCovCoverContrast: parameter('Coverage Contrast', '覆盖对比度', 'Expands or compresses differences in the low-cloud coverage map.', '增强或压缩低云覆盖图中的差异。'),
  loCovHeightIntensity: parameter('Height Intensity', '高度强度', 'Scales the weather-map height signal.', '缩放天气图中的云高信号。'),
  loCovHeightContrast: parameter('Height Contrast', '高度对比度', 'Shapes contrast in the weather-map height signal.', '调整天气图云高信号的对比度。'),
  hpShapeScaleX: parameter('Shape Scale X', '形状尺度 X', 'World-space frequency of large cloud shapes along X.', '大尺度云形在 X 方向的世界空间频率。'),
  hpShapeScaleY: parameter('Shape Scale Y', '形状尺度 Y', 'World-space frequency of large cloud shapes vertically.', '大尺度云形在垂直方向的世界空间频率。'),
  hpShapeScaleZ: parameter('Shape Scale Z', '形状尺度 Z', 'World-space frequency of large cloud shapes along Z.', '大尺度云形在 Z 方向的世界空间频率。'),
  hpShapeRotationDeg: parameter('Shape Rotation (°)', '形状旋转（°）', 'Rotates the main horizontal shape field.', '旋转主要的水平形状场。'),
  hpShapeWarpScaleKm: parameter('Warp Scale (km)', '扭曲尺度（km）', 'Size of bends applied to the large cloud field.', '大尺度云场弯曲变化的空间尺度。'),
  hpShapeWarpStrengthM: parameter('Warp Strength (m)', '扭曲强度（m）', 'Maximum world-space displacement from shape warping.', '形状扭曲产生的最大世界空间位移。'),
  hpShapeSecondaryScaleRatio: parameter('Secondary Scale Ratio', '次级尺度比', 'Frequency ratio of the secondary shape octave.', '次级形状倍频相对主形状的频率比例。'),
  hpShapeSecondaryRotationDeg: parameter('Secondary Rotation (°)', '次级旋转（°）', 'Rotation of the secondary shape octave.', '次级形状倍频的旋转角度。'),
  hpShapeSecondaryWeight: parameter('Secondary Weight', '次级权重', 'Blend weight of the secondary large-scale pattern.', '次级大尺度图案的混合权重。'),
  hpDetailScaleX: parameter('Detail Scale X', '细节尺度 X', 'Detail-noise frequency along X.', '细节噪声在 X 方向的频率。'),
  hpDetailScaleY: parameter('Detail Scale Y', '细节尺度 Y', 'Detail-noise frequency vertically.', '细节噪声在垂直方向的频率。'),
  hpDetailScaleZ: parameter('Detail Scale Z', '细节尺度 Z', 'Detail-noise frequency along Z.', '细节噪声在 Z 方向的频率。'),
  hpBaseWindSpeed: parameter('Base Wind Speed', '基础风速倍率', 'Animation multiplier for large cloud shapes.', '大尺度云形的动画速度倍率。'),
  hpDetailWindSpeed: parameter('Detail Wind Speed', '细节风速倍率', 'Horizontal animation multiplier for detail erosion.', '细节侵蚀的水平动画速度倍率。'),
  hpDetailVerticalWindSpeed: parameter('Detail Vertical Wind', '细节垂直风速', 'Vertical animation speed for detail noise.', '细节噪声的垂直动画速度。'),
  billowyLowWeight: parameter('Billowy Low Weight', '团状低频权重', 'Low-frequency contribution of billowy erosion noise.', '团状侵蚀噪声的低频通道权重。'),
  billowyHighWeight: parameter('Billowy High Weight', '团状高频权重', 'High-frequency contribution of billowy erosion noise.', '团状侵蚀噪声的高频通道权重。'),
  wispyLowWeight: parameter('Wispy Low Weight', '丝缕低频权重', 'Low-frequency contribution of wispy erosion noise.', '丝缕侵蚀噪声的低频通道权重。'),
  wispyHighWeight: parameter('Wispy High Weight', '丝缕高频权重', 'High-frequency contribution of wispy erosion noise.', '丝缕侵蚀噪声的高频通道权重。'),
  detailStrengthCu: parameter('Cumulus Detail', '积云细节', 'Detail erosion strength for fair-weather cumulus.', '普通积云使用的细节侵蚀强度。'),
  detailStrengthTcu: parameter('Towering Cumulus Detail', '浓积云细节', 'Detail erosion strength for towering cumulus.', '浓积云使用的细节侵蚀强度。'),
  detailStrengthCb: parameter('Cumulonimbus Detail', '积雨云细节', 'Detail erosion strength for cumulonimbus.', '积雨云使用的细节侵蚀强度。'),
  densityMultiplierCu: parameter('Cumulus Density', '积云密度', 'Density multiplier for fair-weather cumulus.', '普通积云的密度倍率。'),
  densityMultiplierTcu: parameter('Towering Cumulus Density', '浓积云密度', 'Density multiplier for towering cumulus.', '浓积云的密度倍率。'),
  densityMultiplierCb: parameter('Cumulonimbus Density', '积雨云密度', 'Density multiplier for cumulonimbus.', '积雨云的密度倍率。'),
  densityMultiplier: parameter('Global Density', '全局密度', 'Final density multiplier shared by low-cloud types.', '低云云型共享的最终密度倍率。'),
  loCoverTopStrength: parameter('Top Coverage Strength', '顶部覆盖强度', 'Adds weather coverage toward the cloud top.', '在云层顶部增强天气覆盖率。'),
  loCoverTopMax: parameter('Top Coverage Maximum', '顶部覆盖上限', 'Upper clamp for the top-coverage boost.', '顶部覆盖增强的上限。'),
  loCoverTopCurvePow: parameter('Top Coverage Curve', '顶部覆盖曲线', 'Height curve used by the top-coverage boost.', '顶部覆盖增强随高度变化的曲线。'),
  scStrength: parameter('Stratocumulus Strength', '层积云强度', 'Blends the dedicated stratocumulus density path.', '混合专用层积云密度路径。'),
  scHeightScale: parameter('Layer Height Scale', '云层高度比例', 'Compresses or expands the stratocumulus vertical profile.', '压缩或拉伸层积云的垂直剖面。'),
  scDetailStrength: parameter('Detail Strength', '细节强度', 'Erosion strength within the stratocumulus path.', '层积云路径内部的侵蚀细节强度。'),
  scCellThickPow: parameter('Cell Thickness Curve', '胞体厚度曲线', 'Curve shaping the thickness of cellular cloud masses.', '塑造胞状云团厚度的曲线。'),
  scCellThickStrength: parameter('Cell Thickness', '胞体厚度', 'Strength of cellular thickness modulation.', '胞状厚度调制的强度。'),
  scCellNoiseStrength: parameter('Cell Noise', '胞状噪声', 'Strength of the cellular breakup pattern.', '胞状分裂图案的强度。'),
  scCoverageIntensity: parameter('Coverage Intensity', '覆盖强度', 'Coverage scale for the stratocumulus path.', '层积云路径的覆盖率缩放。'),
  scCoverageContrast: parameter('Coverage Contrast', '覆盖对比度', 'Coverage contrast for the stratocumulus path.', '层积云路径的覆盖率对比度。'),
  scCellScaleX: parameter('Cell Scale X', '胞体尺度 X', 'Horizontal cellular frequency along X.', '胞状图案在 X 方向的水平频率。'),
  scCellScaleZ: parameter('Cell Scale Z', '胞体尺度 Z', 'Horizontal cellular frequency along Z.', '胞状图案在 Z 方向的水平频率。'),
  hiAConstant: parameter('High-A Constant', '高阶 A 常量', 'Adds a constant term before final density remapping.', '最终密度重映射前加入的常量项。'),
  hiASoftContrast: parameter('High-A Soft Contrast', '高阶 A 柔和对比', 'Soft contrast curve applied to the high-order density term.', '作用于高阶密度项的柔和对比曲线。'),
  densityModIntensity: parameter('Density Modulation', '密度调制', 'Strength of the final density modulation signal.', '最终密度调制信号的强度。'),
  densityModContrast: parameter('Modulation Contrast', '调制对比度', 'Contrast of the final density modulation signal.', '最终密度调制信号的对比度。'),
  noiseMipOffset: parameter('Shape Mip Offset', '形状 Mip 偏移', 'Biases large-shape noise toward coarser mip levels.', '让大尺度形状噪声偏向更粗的 Mip 层级。'),
  erosionMipOffset: parameter('Erosion Mip Offset', '侵蚀 Mip 偏移', 'Biases erosion noise toward coarser mip levels.', '让侵蚀噪声偏向更粗的 Mip 层级。'),
  forceSimpleMode: parameter('Force Simple Mode', '强制简化模式', 'Always use the reduced-detail density path.', '始终使用低细节密度路径。'),
  detailFadeEnabled: parameter('Distance Detail Fade', '距离细节淡出', 'Fades high-frequency detail with camera distance.', '随相机距离淡出高频细节。'),
  highWeatherRepeat: parameter('Weather Repeat', '天气图重复频率', 'World-space repeat frequency and advection scale of the high-cloud weather field.', '中高云天气场的世界空间重复频率和平流尺度。'),
  highSteps: parameter('Ray Steps', '步进次数', 'Primary ray-march samples through the high-cloud layer.', '穿过中高云层的主光线采样次数。'),
  highBandBottom: parameter('Band Bottom', '云带底部', 'Normalized lower edge of the high-cloud vertical band.', '中高云垂直带的归一化下边缘。'),
  highBandTop: parameter('Band Top', '云带顶部', 'Normalized upper edge of the high-cloud vertical band.', '中高云垂直带的归一化上边缘。'),
  highBottomCoverageScale: parameter('Bottom Coverage', '底部覆盖比例', 'Coverage retained near the bottom of the vertical band.', '垂直云带底部保留的覆盖比例。'),
  highHeightCurvePow: parameter('Height Curve', '高度曲线', 'Exponent shaping density across the high-cloud height band.', '塑造中高云密度随高度变化的指数。'),
  highDensityThreshold: parameter('Density Threshold', '密度阈值', 'Cutoff applied to high-cloud noise.', '中高云噪声的密度截断阈值。'),
  highDensitySoftness: parameter('Density Softness', '密度柔度', 'Width of the high-cloud threshold transition.', '中高云密度阈值过渡的宽度。'),
  highCloudSoftness: parameter('Cloud Softness', '云体柔度', 'Final softness of high-cloud opacity and edges.', '中高云不透明度与边缘的最终柔和程度。'),
  highViewAbsorption: parameter('View Absorption', '视线吸收', 'Extinction along the camera ray through high clouds.', '视线穿过中高云时的消光强度。'),
  highLightAbsorption: parameter('Light Absorption', '光照吸收', 'Extinction along the sun ray inside high clouds.', '太阳光在中高云内部传播时的消光强度。'),
  highCoverAbsorptionStrength: parameter('Coverage Shadow', '覆盖阴影', 'Darkens high clouds in regions with greater coverage.', '在覆盖率更高的区域压暗中高云。'),
  highCellScaleX: parameter('Cell Scale X', '胞体尺度 X', 'Cellular pattern frequency along X.', '胞状图案在 X 方向的频率。'),
  highCellScaleZ: parameter('Cell Scale Z', '胞体尺度 Z', 'Cellular pattern frequency along Z.', '胞状图案在 Z 方向的频率。'),
  highCellWindSpeed: parameter('Cell Wind Speed', '胞体风速', 'Advection speed multiplier for the cellular field.', '胞状场的平流速度倍率。'),
  highWarpScaleX: parameter('Warp Scale X', '扭曲尺度 X', 'Domain-warp frequency along X.', '域扭曲在 X 方向的频率。'),
  highWarpScaleZ: parameter('Warp Scale Z', '扭曲尺度 Z', 'Domain-warp frequency along Z.', '域扭曲在 Z 方向的频率。'),
  highWarpStrength: parameter('Warp Strength', '扭曲强度', 'Displacement strength of the high-cloud domain warp.', '中高云域扭曲的位移强度。'),
  highAcCellStrength: parameter('Altocumulus Cells', '高积云胞体', 'Cellular structure strength for altocumulus.', '高积云的胞状结构强度。'),
  highAsCellStrength: parameter('Altostratus Cells', '高层云胞体', 'Cellular structure strength retained in altostratus.', '高层云中保留的胞状结构强度。'),
  highCellPow: parameter('Cell Curve', '胞体曲线', 'Contrast curve of the high-cloud cellular pattern.', '中高云胞状图案的对比曲线。'),
  highWispScaleX: parameter('Wisp Scale X', '丝缕尺度 X', 'Wispy-detail frequency along X.', '丝缕细节在 X 方向的频率。'),
  highWispScaleZ: parameter('Wisp Scale Z', '丝缕尺度 Z', 'Wispy-detail frequency along Z.', '丝缕细节在 Z 方向的频率。'),
  highHorizonStartKm: parameter('Horizon Fade Start (km)', '地平线淡出起点（km）', 'Distance where high-cloud horizon fading begins.', '中高云地平线淡出开始的距离。'),
  highHorizonEndKm: parameter('Horizon Fade End (km)', '地平线淡出终点（km）', 'Distance where high-cloud horizon fading finishes.', '中高云地平线淡出完成的距离。'),
  weatherMapCenterX: parameter('Map Center X (m)', '天气图中心 X（m）', 'World-space X coordinate of the weather-map center.', '天气图中心的世界空间 X 坐标。'),
  weatherMapCenterZ: parameter('Map Center Z (m)', '天气图中心 Z（m）', 'World-space Z coordinate of the weather-map center.', '天气图中心的世界空间 Z 坐标。'),
  weatherMapWorldSizeKm: parameter('Map World Size (km)', '天气图范围（km）', 'World width covered by the finite low-cloud weather map.', '有限低云天气图覆盖的世界宽度。'),
  windSpeed: parameter('Wind Speed (m/s)', '风速（m/s）', 'World-space advection speed.', '云场的世界空间平流速度。'),
  windAngleDeg: parameter('Wind Direction (°)', '风向（°）', 'Horizontal wind direction in degrees.', '水平风向角度。'),
  detailStrength: parameter('Detail Strength', '雕刻强度', 'Amount of high-frequency erosion applied to cloud edges.', '施加到云边缘的高频侵蚀量。'),
  detailRepeat: parameter('Detail Repeat', '细节重复频率', 'World-space frequency of the sculpting detail texture.', '雕刻细节纹理的世界空间频率。'),
  wispyEdgeWidth: parameter('Wispy Edge Width', '丝缕边缘宽度', 'Width of the edge region that receives wispy erosion.', '接受丝缕侵蚀的边缘区域宽度。'),
  detailOff: parameter('Disable Detail', '关闭细节', 'Disables detail erosion for a clean base-density comparison.', '关闭细节侵蚀，便于观察基础密度。'),
  sunAzimuthDeg: parameter('Sun Azimuth (°)', '太阳方位角（°）', 'Compass direction of the sun.', '太阳的水平罗盘方向。'),
  sunElevationDeg: parameter('Sun Elevation (°)', '太阳高度角（°）', 'Sun angle above the horizon.', '太阳相对地平线的高度角。'),
  toneMapper: parameter('Tone Mapper', '色调映射', 'HDR-to-display response curve.', '将 HDR 颜色转换到显示范围的响应曲线。'),
  exposure: parameter('Exposure', '曝光', 'Brightness multiplier applied before tonemapping.', '色调映射前应用的亮度倍率。'),
  skyIntensity: parameter('Sky Intensity', '天空强度', 'Brightness of the procedural sky gradient.', '程序化天空渐变的亮度。'),
  skyHorizonExponent: parameter('Horizon Curve', '地平线曲线', 'Controls how quickly zenith color transitions toward the horizon.', '控制天顶色过渡到地平线色的速度。'),
  colorSaturation: parameter('Saturation', '饱和度', 'Final color saturation after lighting.', '光照计算后的最终色彩饱和度。'),
  colorContrast: parameter('Contrast', '对比度', 'Final display contrast around middle gray.', '围绕中灰调整最终显示对比度。'),
  skyZenithR: parameter('Red', '红色', 'Linear red component of the zenith color.', '天顶颜色的线性红色分量。'),
  skyZenithG: parameter('Green', '绿色', 'Linear green component of the zenith color.', '天顶颜色的线性绿色分量。'),
  skyZenithB: parameter('Blue', '蓝色', 'Linear blue component of the zenith color.', '天顶颜色的线性蓝色分量。'),
  skyHorizonR: parameter('Red', '红色', 'Linear red component of the horizon color.', '地平线颜色的线性红色分量。'),
  skyHorizonG: parameter('Green', '绿色', 'Linear green component of the horizon color.', '地平线颜色的线性绿色分量。'),
  skyHorizonB: parameter('Blue', '蓝色', 'Linear blue component of the horizon color.', '地平线颜色的线性蓝色分量。'),
  hpLightingEnabled: parameter('Enable HP Lighting', '启用 HP 光照', 'Uses the HP-style low-cloud lighting model.', '使用 HP 风格的低云光照模型。'),
  forwardEccentricity: parameter('Forward Eccentricity', '前向散射偏心率', 'Henyey–Greenstein forward-scattering lobe; higher values create a tighter sun glow.', 'Henyey–Greenstein 前向散射瓣；越高，朝太阳的光晕越集中。'),
  backwardEccentricity: parameter('Backward Eccentricity', '后向散射偏心率', 'Strength and focus of the backward-scattering lobe.', '后向散射瓣的强度与集中程度。'),
  msAttenuation: parameter('MS Attenuation', '多重散射衰减', 'Energy retained by each multiple-scattering octave.', '每一级多重散射保留的能量。'),
  msContribution: parameter('MS Contribution', '多重散射贡献', 'Overall contribution of multiple scattering.', '多重散射对最终光照的总体贡献。'),
  msEccentricity: parameter('MS Eccentricity', '多重散射偏心率', 'How quickly phase anisotropy relaxes across scattering octaves.', '相位各向异性在多重散射层级间减弱的速度。'),
  ambientTopMultiplier: parameter('Top Ambient', '顶部环境光', 'Ambient-light multiplier near cloud tops.', '靠近云顶的环境光倍率。'),
  ambientBottomMultiplier: parameter('Bottom Ambient', '底部环境光', 'Ambient-light multiplier near cloud bases.', '靠近云底的环境光倍率。'),
  aoUpwardScale: parameter('Upward AO', '向上环境遮蔽', 'Scales upward self-occlusion used to darken cloud interiors.', '缩放用于压暗云内部的向上自遮蔽。'),
  scatterSourceODScale: parameter('Scatter Optical Depth', '散射光学深度', 'Optical-depth scale used to shape the local scattering source.', '塑造局部散射光源项的光学深度尺度。'),
  scatterSourceCurvePow: parameter('Scatter Source Curve', '散射源曲线', 'Contrast curve of the local scattering source.', '局部散射光源项的对比曲线。'),
  enabled: parameter('Enabled', '启用', 'Includes this cloud volume in rendering.', '在渲染中包含此云体积。'),
  genus: parameter('Cloud Genus', '云属', 'Selects the cloud morphology profile.', '选择云的形态剖面。'),
  cumulusDevelopment: parameter('Cumulus Development', '积云发展度', 'Morphs cumulus from fair-weather Cu toward towering Cu.', '将普通积云逐渐塑造成浓积云。'),
  baseKm: parameter('Base Altitude (km)', '云底高度（km）', 'Bottom altitude of this generic cloud layer.', '该通用云层的底部海拔。'),
  topKm: parameter('Top Altitude (km)', '云顶高度（km）', 'Top altitude of this generic cloud layer.', '该通用云层的顶部海拔。'),
  densityScale: parameter('Density Scale', '密度比例', 'Density multiplier for this generic layer.', '该通用云层的密度倍率。'),
  detailAmount: parameter('Detail Amount', '细节量', 'Detail erosion amount for this generic layer.', '该通用云层的细节侵蚀量。'),
  coverage: parameter('Coverage', '覆盖率', 'Horizontal coverage of the hero cloud.', '主角云的水平覆盖率。'),
  densityMul: parameter('Density Multiplier', '密度倍率', 'Density multiplier of the hero cloud.', '主角云的密度倍率。'),
  minPrimaryStep: parameter('Minimum Step (m)', '最小步长（m）', 'Smallest primary ray-march step inside dense regions.', '致密区域内的最小主光线步长。'),
  maxPrimaryStep: parameter('Maximum Step (m)', '最大步长（m）', 'Largest primary ray-march step through empty or distant regions.', '空旷或远距离区域内的最大主光线步长。'),
  maxIterations: parameter('Maximum Iterations', '最大迭代次数', 'Hard limit on primary ray-march iterations.', '主光线步进迭代的硬上限。'),
  lightSteps: parameter('Light Steps', '光照步数', 'Samples toward the sun for cloud self-shadowing.', '沿太阳方向采样以计算云体自阴影的次数。'),
  debugMode: parameter('Debug View', '调试视图', 'Shows intermediate density, weather, support, or final rendering data.', '显示密度、天气、包围范围或最终渲染等中间数据。'),
  side: parameter('Side View', '侧视图', 'Inspect the cloud vertical profile from the side.', '从侧面观察云的垂直剖面。'),
  oblique45: parameter('45° Oblique View', '45° 斜视图', 'Inspect shape, height, and depth together.', '同时观察云的形状、高度和纵深。'),
  top: parameter('Top View', '俯视图', 'Inspect weather coverage and horizontal structure from above.', '从上方观察天气覆盖和水平结构。'),
  hpOcean: parameter('HP Ocean Baseline', 'HP 海面基准视角', 'Use the long-range ocean comparison camera.', '使用远距离海面基准对比相机。'),
};

const CLOUD_GENERA: Record<string, Copy> = {
  cumulus: copy('Cumulus', '积云'),
  stratus: copy('Stratus', '层云'),
  stratocumulus: copy('Stratocumulus', '层积云'),
  cumulonimbus: copy('Cumulonimbus', '积雨云'),
  altocumulus: copy('Altocumulus', '高积云'),
  altostratus: copy('Altostratus', '高层云'),
  nimbostratus: copy('Nimbostratus', '雨层云'),
  cirrus: copy('Cirrus', '卷云'),
  cirrostratus: copy('Cirrostratus', '卷层云'),
  cirrocumulus: copy('Cirrocumulus', '卷积云'),
};

const RENDER_PATHS: Record<string, Copy> = {
  volume: copy('Canonical Volume', '标准体积'),
  'local-volume': copy('Local Hero Cb', '局部主角积雨云'),
  'high-sheet': copy('High Sheet Ac / As', '高空薄层高积云 / 高层云'),
};

const MORPHOLOGY_STATUS: Record<string, Copy> = {
  default: copy('Default recipe', '默认配方'),
  custom: copy('Customized', '已自定义'),
};

const GENUS_MORPHOLOGY_CHANGES: Record<string, Copy> = {
  'load-defaults': copy('Load new genus defaults', '加载新云属默认配方'),
  'preserve-custom': copy('Preserve current values', '保留当前自定义数值'),
};

const PRESETS: Record<string, Copy> = {
  default: copy('Default', '默认'),
  'side-cu': copy('Side Cumulus', '侧视积云'),
  'oblique-tcu': copy('Oblique Towering Cumulus', '斜视浓积云'),
  'oblique-cb': copy('Oblique Cumulonimbus', '斜视积雨云'),
  'top-density': copy('Top Density', '俯视密度'),
  'cirrus-side': copy('Cirrus Side', '侧视卷云'),
  'cirrus-oblique': copy('Cirrus Oblique', '斜视卷云'),
  'cirrus-top-density': copy('Cirrus Top Density', '卷云俯视密度'),
  'genus-stratus': copy('Validate Stratus', '验证层云'),
  'genus-altocumulus': copy('Validate Altocumulus', '验证高积云'),
  'genus-altostratus': copy('Validate Altostratus', '验证高层云'),
  'genus-nimbostratus': copy('Validate Nimbostratus', '验证雨层云'),
  'genus-cirrostratus': copy('Validate Cirrostratus', '验证卷层云'),
  'genus-cirrocumulus': copy('Validate Cirrocumulus', '验证卷积云'),
  'eight-body-stress': copy('Eight-Body Stress', '八云体压力测试'),
  'detail-off': copy('Detail Off', '关闭细节'),
  'stratocumulus-sheet': copy('Stratocumulus Sheet', '层积云片层'),
  'hp-ocean-day': copy('HP Ocean Day', 'HP 海洋白天'),
};

const DEBUG_MODES: Record<string, Copy> = {
  Final: copy('Final', '最终画面'),
  Support: copy('Support Bounds', '有效范围'),
  AfterShape: copy('After Shape', '形状后密度'),
  FinalDensity: copy('Final Density', '最终密度'),
  Weather: copy('Weather', '天气图'),
  DensityCoverage: copy('Density Coverage', '密度覆盖'),
  HighWeather: copy('High-Cloud Weather', '中高云天气图'),
  HighBand: copy('High-Cloud Band', '中高云高度带'),
  HighDensity: copy('High-Cloud Density', '中高云密度'),
};

let lang: Lang = (() => {
  const saved = typeof localStorage === 'undefined' ? null : localStorage.getItem('lang');
  if (saved === 'en' || saved === 'zh') return saved;
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
})();

function text(value: Copy | undefined, fallback: string): string {
  return value?.[lang] ?? fallback;
}

function humanize(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\bHp\b/g, 'HP')
    .replace(/\bRgb\b/g, 'RGB')
    .replace(/\bKm\b/g, 'km')
    .replace(/\bDeg\b/g, '°')
    .replace(/^./, (character) => character.toUpperCase());
}

export function getLang(): Lang {
  return lang;
}

export function setLang(next: Lang): void {
  lang = next;
  if (typeof localStorage !== 'undefined') localStorage.setItem('lang', next);
}

export function uiText(key: keyof typeof UI): string {
  return text(UI[key], key);
}

export function folderLabel(key: string): string {
  return text(FOLDERS[key]?.label, key);
}

export function folderTip(key: string): string {
  return text(FOLDERS[key]?.tip, '');
}

export function parameterLabel(key: string): string {
  return text(PARAMETERS[key]?.label, humanize(key));
}

export function parameterTip(key: string): string {
  const known = PARAMETERS[key];
  if (known) return text(known.tip, '');
  const label = parameterLabel(key);
  return lang === 'zh' ? `调整“${label}”参数。` : `Adjust the ${label} parameter.`;
}

export function cloudGenusOptions(values: readonly string[]): Record<string, string> {
  return Object.fromEntries(values.map((value) => [text(CLOUD_GENERA[value], value), value]));
}

export function cloudGenusLabel(value: string): string {
  return text(CLOUD_GENERA[value], value);
}

export function cloudRenderPathLabel(value: string): string {
  return text(RENDER_PATHS[value], value);
}

export function morphologyStatusLabel(isDefault: boolean): string {
  return text(MORPHOLOGY_STATUS[isDefault ? 'default' : 'custom'], isDefault ? 'Default recipe' : 'Customized');
}

export function genusMorphologyChangeOptions(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(GENUS_MORPHOLOGY_CHANGES).map(([value, label]) => [text(label, value), value]),
  );
}

export function cloudPresetOptions(values: readonly string[]): Record<string, string> {
  return Object.fromEntries(values.map((value) => [text(PRESETS[value], value), value]));
}

export function debugModeOptions(values: readonly string[]): Record<string, string> {
  return Object.fromEntries(values.map((value) => [text(DEBUG_MODES[value], value), value]));
}
