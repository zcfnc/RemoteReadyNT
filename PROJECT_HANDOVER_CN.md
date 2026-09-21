# RemoteReady NT 项目交接与开发路线

> 面向下一位开发者、比赛队友和展示人员的完整交接文档。  
> 仓库：<https://github.com/zcfnc/RemoteReadyNT>  
> 当前分支：`main`  
> 文档更新日期：2026-09-21

## 1. 项目概述

RemoteReady NT 是为 CDU IT Code Fair 2026 Data Innovation Challenge 制作的本地运行 MVP。项目关注北领地偏远社区在气旋、通信基站故障和低网络覆盖情况下的通信韧性与应急准备。

产品希望回答四个连续问题：

1. **Incident：发生了什么？**
2. **Impact：哪些社区和公共设施受到影响？**
3. **Priority：下一次设备或人员部署应该去哪里？**
4. **Action：响应人员下一步应该做什么？**

地图是产品的主要工作界面。当前默认演示 Tower outage 情景，以 Berrimah 为建模事故点，展示从事故发现到部署建议的决策流程。

### 1.1 当前定位

- 比赛演示和用户验证使用的第一版 MVP。
- 本地静态网站，无后端、无用户账户、无云数据库。
- 使用公开数据和明确标记的原型建模数据。
- 支持离线缓存，但首次加载在线地图底图仍需要网络。
- **不是正式灾害预警系统，也不能替代 BoM、NT Emergency Service 或通信运营商的官方信息。**

## 2. 已实现功能

### 2.1 Dashboard

- Leaflet 交互式北领地地图。
- 社区、移动小基站、诊所/医院、学校、社区中心和避难设施图层。
- Normal、Cyclone、Tower outage 三种演示情景。
- 根据情景联动更新事故提示、地图状态、优先部署卡和风险数字。
- Normal、Degraded、Offline、Critical 四级地图状态语义。
- 地点搜索、优先地点快捷搜索和详细结果信息。
- Berrimah “Why this priority?” 决策抽屉。
- 气旋轨迹、不确定区域、可拖动和可播放的时间轴。
- 地图定位、全屏、缩放和范围复位控制。

### 2.2 Preparedness

- 八项离线准备清单。
- 完成状态保存在浏览器 `localStorage`。
- 离线数据包缓存入口。
- 当前网络/缓存状态提示。
- 复制情景摘要和定位工具。

### 2.3 Data sources

- 显示数据来源、刷新日期、记录数量和来源可用状态。
- 区分公开发布数据与原型建模数据。
- 可下载最近一次数据更新日志。
- 公开来源链接可直接访问。

## 3. 技术架构

项目刻意保持轻量，当前不需要 Node.js、npm 或前端构建过程。

| 部分 | 技术 | 说明 |
| --- | --- | --- |
| 页面 | HTML5 | 单页多视图结构 |
| 样式 | 原生 CSS | 桌面与移动端响应式布局 |
| 交互 | 原生 JavaScript | 无框架、无打包器 |
| 地图 | Leaflet | 库文件保存在本地 `dist/vendor/leaflet` |
| 底图 | OpenStreetMap | 地图瓦片首次使用需要网络 |
| 数据 | GeoJSON / JSON / XLSX | 浏览器读取 GeoJSON，脚本处理 XLSX |
| 数据更新 | Python 3 + openpyxl | 下载和转换公开数据 |
| 离线能力 | Service Worker + Cache API | 缓存核心资源和数据包 |
| 本地存储 | localStorage | 保存准备清单和离线包状态 |

### 3.1 页面启动顺序

`dist/app.js` 的启动流程如下：

1. 初始化三个页面之间的导航。
2. 初始化 Leaflet 地图和地图图层。
3. 绑定地图、搜索、情景和时间轴控件。
4. 初始化准备清单与离线状态。
5. 注册 Service Worker。
6. 加载 `dist/data` 中的 GeoJSON 和数据来源日志。
7. 默认进入 Tower outage 演示情景。

## 4. 目录结构

```text
RemoteReadyNT/
├─ README.md                     # 快速启动说明
├─ PROJECT_HANDOVER_CN.md        # 本交接文档
├─ dist/                         # 浏览器直接运行的网站
│  ├─ index.html                 # 页面结构与三个视图
│  ├─ styles.css                 # 所有视觉和响应式样式
│  ├─ app.js                     # 地图、情景、搜索、离线功能
│  ├─ service-worker.js          # 核心文件与数据缓存
│  ├─ manifest.webmanifest       # PWA 元数据
│  ├─ data/                      # 浏览器实际读取的数据
│  └─ vendor/leaflet/            # 本地 Leaflet 依赖
├─ scripts/
│  └─ download_data.py           # 下载、清洗并复制数据到 dist/data
├─ data/                         # 原始文件、缓存和生成数据
├─ .openai/hosting.json          # 历史静态托管配置；本地运行不依赖它
└─ remoteready-nt.tar.gz         # 早期项目打包文件，可在确认无用后移除
```

### 4.1 修改功能时应该编辑哪里

- 页面文本、布局结构：`dist/index.html`
- 颜色、间距、桌面/移动端样式：`dist/styles.css`
- 地图、搜索、情景、准备清单：`dist/app.js`
- 离线缓存资源列表：`dist/service-worker.js`
- 数据下载与转换：`scripts/download_data.py`
- 原型社区风险输入：`data/communities.json`

## 5. 本地开发环境

### 5.1 环境要求

- Windows、macOS 或 Linux。
- Python 3.10 或更高版本。
- Python 包 `openpyxl`，仅在刷新数据时需要。
- Edge、Chrome 或 Firefox 的现代版本。

安装数据脚本依赖：

```powershell
python -m pip install openpyxl
```

### 5.2 获取项目

仓库当前是私有的。仓库所有者需要先在 GitHub 的 **Settings → Collaborators** 中邀请队友。

```powershell
git clone https://github.com/zcfnc/RemoteReadyNT.git
cd RemoteReadyNT
```

### 5.3 启动网站

在仓库根目录运行：

```powershell
python -m http.server 4317 --directory dist
```

然后访问：

```text
http://127.0.0.1:4317/index.html
```

不要直接双击打开 `dist/index.html`。浏览器的 `fetch`、Service Worker 和离线缓存需要 HTTP 环境。

### 5.4 停止网站

在启动服务器的终端中按 `Ctrl+C`。

## 6. 数据更新流程

### 6.1 执行数据更新

```powershell
python scripts/download_data.py
```

脚本将：

1. 检查公开来源页面是否可访问。
2. 从 NT Government Open Data API 查找并下载移动覆盖 XLSX。
3. 将社区和小基站 XLSX 转换为 `connectivity.geojson`。
4. 通过 OpenStreetMap Overpass API下载公共设施。
5. 将数据写入 `data/`，并复制浏览器需要的数据到 `dist/data/`。
6. 生成 `download_log.json`，记录成功、失败和记录数量。

### 6.2 当前数据状态

最近一次已提交数据更新时间为 2026-09-18：

- 64 个偏远社区。
- 24 个移动小基站。
- 88 个连接位置合计。
- 1,080 个公共设施。
- 8 个来源中有 7 个在刷新时可用。
- ACCC Mobile Infrastructure Report 页面返回 HTTP 403；这是来源页面访问限制，不会删除已有缓存数据。

### 6.3 数据来源

- Northern Territory Government Open Data：远程社区移动覆盖和小基站。
- OpenStreetMap contributors：诊所、医院、学校、社区中心和避难设施。
- Bureau of Meteorology：气旋历史数据参考页面。
- Australian Bureau of Statistics：Census DataPacks 参考页面。
- Department of Infrastructure：First Nations digital inclusion 参考页面。
- ACCC：Mobile Infrastructure Report 参考页面。

### 6.4 实测数据与建模数据

必须始终保持以下区分：

**公开或发布数据**

- 社区和小基站坐标。
- 数据表中提供的运营商和回传信息。
- OpenStreetMap 公共设施位置。

**原型建模数据**

- Berrimah Tower outage 事故。
- 受影响社区/设施数量。
- 响应 ETA。
- 韧性分数和部署优先级。
- 演示气旋轨迹和不确定区域。

任何演示、报告和 UI 都不能把建模数值描述为实时事实。

## 7. 关键代码说明

### 7.1 `dist/app.js`

重要对象与函数：

- `BERRIMAH`：Tower outage 演示事故点。
- `scenarioText`：三个情景的文案、优先地点和响应指标。
- `initMap()`：创建 Leaflet 地图和所有图层容器。
- `buildScenarioLayers()`：绘制气旋轨迹、预测区域和 Berrimah 事故范围。
- `addConnectivity()` / `addFacilities()`：把 GeoJSON 加入地图。
- `setScenario()`：驱动警告条、指标、地图图层和优先卡联动。
- `showPriorityPlan()`：渲染 “Why this priority?” 决策依据。
- `runSearch()`：社区、站点和公共设施搜索。
- `updateTimeline()` / `toggleTimeline()`：气旋时间轴交互。
- `saveOfflinePack()`：缓存网站核心资源和数据文件。
- `renderSources()`：生成 Data sources 页面。

### 7.2 `dist/styles.css`

文件前半部分是原始基础样式，后半部分的 `Decision-first dashboard redesign` 是目前使用的视觉重构覆盖层。继续开发时建议逐步整理重复规则，而不是继续无限追加覆盖样式。

### 7.3 Service Worker

修改网站核心文件后，如果浏览器仍显示旧内容，应更新 `dist/service-worker.js` 中的缓存版本，例如：

```javascript
const CACHE = 'remoteready-core-v4';
```

随后刷新页面，必要时在浏览器开发者工具中清除旧 Service Worker 和站点缓存。

## 8. Git 与协作流程

GitHub 远程：

```text
origin  https://github.com/zcfnc/RemoteReadyNT.git
```

推荐每项功能使用独立分支：

```powershell
git switch main
git pull
git switch -c feature/real-cyclone-feed
```

完成后：

```powershell
git add .
git commit -m "feat: add real cyclone feed adapter"
git push -u origin feature/real-cyclone-feed
```

然后在 GitHub 创建 Pull Request，由至少一名队友检查后合并。

推荐提交前缀：

- `feat:` 新功能。
- `fix:` 修复问题。
- `data:` 更新数据。
- `docs:` 更新文档。
- `style:` 只修改视觉样式。
- `refactor:` 不改变用户功能的代码整理。
- `test:` 增加或修改测试。

不要提交密码、访问令牌、个人位置记录或未获授权的社区敏感数据。

## 9. 手动验收清单

每次准备演示或合并较大修改前检查：

### 9.1 页面与导航

- Dashboard、Preparedness 和 Data sources 都能打开。
- 从 Data sources 直接刷新后返回地图不会出现 Leaflet `NaN` 错误。
- 桌面和手机宽度下没有被遮挡的重要按钮。

### 9.2 地图

- 默认 Tower outage 情景显示 Berrimah 事故点和优先卡。
- 点击 “View response plan” 显示完整决策抽屉。
- Normal、Cyclone、Tower outage 切换后地图与指标同步变化。
- Cyclone 情景显示时间轴，其他情景隐藏时间轴。
- 时间轴可以拖动、播放和暂停。
- 社区、小基站和公共设施图层可独立开关。
- 搜索 Berrimah、Wadeye、Borroloola 能得到结果。

### 9.3 离线与数据

- Preparedness 清单刷新浏览器后仍然保留。
- 保存离线包后状态文字更新。
- Data sources 数量与 `dist/data/download_log.json` 一致。
- 浏览器控制台没有 JavaScript 错误。

## 10. 已知限制和技术债务

1. **不是实时系统**：情景和优先级由前端静态逻辑产生。
2. **没有后端**：无法多人同步、管理事件或保存响应记录。
3. **没有正式评分模型**：优先级理由适合展示，但需要可审计的计算公式。
4. **气旋轨迹是演示数据**：没有连接 BoM 实时警报或预测数据。
5. **Berrimah 是合成事故**：不可在展示中暗示它是真实事故。
6. **OSM 数据可能不完整**：公共设施名称、状态和能力需要权威验证。
7. **底图不完全离线**：Service Worker 只保证核心数据与已访问资源，未打包全 NT 地图瓦片。
8. **CSS 存在覆盖规则**：视觉重构以文件末尾覆盖旧规则，后续应重构为清晰模块。
9. **缺少自动化测试**：当前主要依赖人工浏览器验收。
10. **根目录压缩包重复**：`remoteready-nt.tar.gz` 与仓库内容重复，决定正式发布方式后可移除。

## 11. 推荐开发方向

### P0：比赛前必须完成

#### 11.1 建立可解释的优先级评分

把当前写死的优先地点改为可计算、可展示的评分模型，例如：

```text
Priority score =
  affected population weight
  + essential service dependency
  + outage severity
  + backup capacity shortage
  + access/restoration difficulty
  - confidence penalty
```

每个权重、输入来源和假设都应显示在 “Why this priority?” 中，评委才能看到数据创新，而不仅是漂亮地图。

#### 11.2 明确数据可信度

- 为每个字段增加 `source`、`updated_at` 和 `confidence`。
- 对缺失、缓存、建模和权威数据使用不同标签。
- 让用户能从地图点直接打开数据来源。

#### 11.3 完成演示故事

准备一个 2–3 分钟固定演示：

1. 打开 Tower outage。
2. 解释事故影响范围。
3. 展示 Berrimah 为什么是第一优先级。
4. 展示响应设备与 ETA。
5. 切换 Cyclone 并播放时间轴。
6. 断网演示 Preparedness 和离线数据。

### P1：增强数据与决策能力

#### 11.4 接入真实灾害信息

- 研究 BoM、Australian Warning System 和 NT Government 可合法使用的机器可读数据。
- 为不同来源设计适配器，不要把下载逻辑直接写进 UI。
- 保存原始响应、解析结果和更新时间，方便审计。

#### 11.5 空间影响分析

- 使用缓冲区、道路可达性和设施依赖关系计算实际影响。
- 区分“位于范围内”和“确实依赖该站点”，避免仅凭距离判断。
- 加入道路封闭、机场/简易跑道和洪水隔离风险。

#### 11.6 情景配置器

允许评委或应急人员选择事故点、故障类型、持续时间、备用电源和影响半径，实时重算优先级。

### P2：工程化

#### 11.7 重构前端

当功能继续增长时，可迁移到 Vite + TypeScript，按以下模块拆分：

- `map/` 地图和图层。
- `scenarios/` 情景状态与计算。
- `data/` 数据加载和验证。
- `offline/` 缓存与同步。
- `components/` UI 组件。

迁移不是比赛前的必要条件。若时间有限，优先完成数据可信度和评分模型。

#### 11.8 自动化测试

- 数据脚本：单元测试 XLSX 字段映射和错误回退。
- 前端：测试情景切换、搜索、优先卡和时间轴。
- 端到端：测试 Dashboard → Preparedness → Data sources 完整流程。
- 数据质量：检查空坐标、重复 ID、异常经纬度和记录数量变化。

#### 11.9 后端和多人协作

只有在确实需要多人同步时再增加后端，建议最小数据模型包括：

- incidents
- communities
- infrastructure_sites
- facilities
- observations
- deployment_recommendations
- response_actions
- source_snapshots

### P3：真实用户与伦理

#### 11.10 与使用者共同设计

- 邀请远程社区代表、应急人员和通信服务人员验证信息层级。
- 不假设所有用户都有稳定网络、现代设备或英文阅读能力。
- 评估大字体、高对比度、键盘操作和屏幕阅读器。
- 研究社区语言版本和图标化离线清单。

#### 11.11 Indigenous Data Sovereignty

- 确认哪些社区数据适合公开展示。
- 对敏感设施和人员信息执行最小化收集。
- 记录数据所有者、授权范围和使用目的。
- 在扩大项目之前参考 Indigenous Data Sovereignty 和 CARE Principles。

## 12. 建议团队分工

如果有 3–4 名队员：

| 角色 | 主要职责 |
| --- | --- |
| Data / GIS | 数据下载、GeoJSON、空间影响和评分模型 |
| Frontend / UX | 地图交互、移动端、无障碍和视觉一致性 |
| Product / Research | 用户访谈、需求、伦理、比赛故事和文档 |
| QA / Integration | 测试、数据质量、离线能力和演示环境 |

每周至少进行一次完整演示，不要等到比赛前才整合各部分。

## 13. 新成员第一天任务

建议接手者按顺序完成：

1. 获得私有 GitHub 仓库访问权限。
2. Clone 仓库并启动 `dist`。
3. 在三个页面中完整操作一次。
4. 阅读 `dist/app.js` 的 `scenarioText`、`setScenario()` 和 `showPriorityPlan()`。
5. 阅读 `scripts/download_data.py` 和 `dist/data/download_log.json`。
6. 创建自己的功能分支。
7. 完成一个小改动并提交 Pull Request，确认协作流程可用。

## 14. 演示和答辩要点

应强调：

- 产品不是普通灾害地图，而是把公开数据转化为可解释的部署决策。
- 离线准备是偏远地区使用场景的核心，不是附加功能。
- 每个建模结论都明确标记，不冒充实时官方警报。
- 下一步的创新重点是可审计的优先级模型和真实用户验证。

不要声称：

- 系统现在能提供实时气旋预警。
- Berrimah 当前真的发生了通信故障。
- 地图已包含所有公共设施。
- 当前优先级模型已得到应急机构验证。

## 15. 交接确认

交接双方应确认：

- 新成员能够访问 GitHub 私有仓库。
- 新成员能够在本地启动网站。
- 新成员理解公开数据与原型建模数据的区别。
- 新成员能够运行数据更新脚本并读懂失败日志。
- 新成员知道比赛前 P0 工作的负责人和截止日期。
- 仓库中没有密码、令牌或未经授权的敏感数据。

