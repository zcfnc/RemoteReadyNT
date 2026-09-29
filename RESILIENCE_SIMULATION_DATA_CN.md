# 社区通信防灾能力模拟数据（仅用于产品演示）

## 边界

`app/public/data/community-resilience-simulation.json` 是 **64 个来源表覆盖点的虚构规划情景**，不是社区真实能力调查、设备库存、报价、故障记录或部署建议。真实来源的点位、服务商和回传记录仍保存在 `connectivity.geojson`；BoM 历史路径接近结果仍保存在 `community-cyclone-exposure.json`。模拟文件仅用 `communityId` 关联这两份数据，不复制或改写历史气旋次数。

原项目 `data/communities.json` 中 6 个示例韧性值没有被当成真实基线，也没有驱动本模拟数据。模拟能力状态只由固定模型版本和 `communityId` 的哈希决定，并应用一条内部一致性约束（假设没有备用供电时，不能同时宣称通信备用路径已独立且经过测试）；所以重新生成可复现，改变历史气旋筛选条件不会改变同一个点的能力分。哈希分配仅用于构造演示情景，**不是对真实社区条件的推断**。

`sourceBoundaries.communityPoints.generatedAt` 是本地 GeoJSON 的转换时间，不等于上游坐标的实地调查日期；后者在当前本地文件中未逐点提供，记为 `upstreamRecordDate=null`。

## 数据字典

| 字段 | 含义 | 来源状态 |
| --- | --- | --- |
| `communityId` | 与来源覆盖点、历史接近记录对齐的 ID | 引用来源数据 |
| `sourcePoint` | 引用的点位文件、点位角色及核实状态 | 点位来自公开来源；核实状态是本产品的保守标记 |
| `dimensions.*.state` | 该维度的虚构情景状态 | `simulation` |
| `dimensions.*.assumption` | 对状态的文字说明，必须使用“Assume”措辞 | `simulation` |
| `dimensions.*.level` | 状态级别：0、0.5、1 | `simulation` |
| `dimensions.*.points` | `level × weight` | 由模拟输入计算 |
| `baselineScore` | 5 个维度得分之和，范围 0–100 | 由模拟输入计算 |
| `gapDimensions` | 按 `weight × (1-level)` 降序列出的未达满级维度 | 由模拟输入计算 |
| `resourceCatalog` | 资源规划选项、前置维度、模拟成本单位与限制 | `simulation` |
| `resourceEvaluations` | 每个资源的适用性、阻断条件、单维提升后的重算分数 | `simulation` |

评分权重是待业务专家校准的**产品草案**：独立通信路径 30、备用供电 25、关键服务通信 20、告警与离线信息 15、运行维护准备 10。每个维度有三个有序的假设状态，级别为 0／0.5／1。**真实能力未知不等于 0 分**；这里能够得到完整分数，仅因为模拟情景为每项填入了虚构状态。

每个资源只将一个目标维度推进一个状态，最多到 1。若目标维度已满级或模拟前置条件不足，则 `planningEligible=false`、`scoreAfter=null`。适用时，`scoreAfter` 使用同一评分公式重新计算，而不是手写提升值。`costUnits` 是相对模拟单位，不是澳元、采购报价或效益估计。

所有点的 `deploymentSiteConfirmed=false`，所有资源评估的 `deploymentEligible=false`。这不妨碍比较虚构的能力建设方案，但不能转化为现场派遣或采购指令。Bynoe 的地名具有地方辖区与来源覆盖点的语义差异，故其 `reviewStatus=locality_name_requires_review`；其他点也标为 `point_role_not_independently_verified`，不能理解成已经核实的施工位置。

## 生成与核查

运行 `python3 scripts/build_resilience_simulation.py` 重新生成数据。脚本会检查覆盖点与历史接近数据的 ID、坐标一致，避免在点位更新后继续引用旧的历史接近结果。运行 `python3 -m unittest scripts.test_build_resilience_simulation -v` 检查覆盖率、确定性、得分复算、资源效果、前置条件、地点核实状态以及真实气旋次数不进入能力分。

下一步 UX／前端可以展示这些情景，但必须在地图、卡片、对比结果中持续标明“模拟”。在获得并核实实际社区能力、设施关系及成本前，不得将模拟分数改称“真实防灾能力”或将模拟资源称为“应当投入”。
