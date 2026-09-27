# RemoteReady NT 项目交接

> 更新日期：2026-09-26。当前产品为 React + TypeScript + Vite 应用；旧版原生 HTML/JavaScript 网站已移除。

## 1. 项目定位

RemoteReady NT 是面向北领地偏远社区通信韧性与离线准备的演示原型。它使用公开位置数据、历史 TC Lam 背景和明确标记的演练输入，帮助用户在通信可能中断前后浏览地图、准备离线资料并核对数据来源。

它不是实时灾害预警、网络监控或调度系统。所有模拟结论均须在当地核实。

## 2. 页面与演练流程

| 页面 | 用途 |
| --- | --- |
| Dashboard | 地图、图层、历史路径、演练阶段与当前行动建议。 |
| Preparedness | 八项断网前准备清单和本设备离线资料包。 |
| Data sources | 数据来源、刷新状态、记录数量和数据边界。 |

Dashboard 有四个演练阶段：48 小时前、24 小时前、12 小时前和模拟结果。

- 阶段 1–3 显示历史演练背景和相应准备行动。
- 阶段 4 显示模拟站点不可用；这不是现实网络故障。
- 最高优先级社区以红色 `PRIORITY: <community>` 标记。点击 Review 会聚焦地图并显示本地核实事项。

已确认的产品决定：历史 TC Lam 路径是固定演示背景；用户不能关闭它。地图探索面板默认展开，Essential services 默认展开但内部设施图层默认关闭。界面不提供重置演练、Restart、`Why this community?` 或旧时间轴标题。

## 3. 技术架构

| 部分 | 技术 | 说明 |
| --- | --- | --- |
| 前端 | React + TypeScript + Vite | 位于 `app/src/`。 |
| 地图 | React Leaflet + Leaflet | 地图、图层和地图工具。 |
| 样式 | CSS | 位于 `app/src/styles/global.css`。 |
| 离线 | vite-plugin-pwa / Workbox / Cache API | 构建生成 Service Worker；地图瓦片仅在访问后缓存。 |
| 数据刷新 | Python 3 + openpyxl（可选） | 仅在有意刷新公开来源时使用。 |
| 测试 | Vitest + Playwright | 单元/交互测试和桌面、移动端视觉回归。 |

## 4. 目录结构

```text
RemoteReadyNT/
├─ app/
│  ├─ public/data/               # React 浏览器运行数据，发布为 /data/...
│  ├─ src/                       # React 页面、组件、数据服务和样式
│  ├─ visual/                    # Playwright 视觉测试与快照
│  ├─ package.json
│  └─ vite.config.ts
├─ data/                         # Python 输入、下载缓存、XLSX 与离线回退数据
├─ scripts/download_data.py      # 可选的数据刷新脚本
├─ README.md                     # 快速启动说明
└─ PROJECT_HANDOVER_CN.md        # 本文档
```

`app/dist/` 是构建产物，不应手动修改。`app/public/data/` 是浏览器运行数据的唯一来源。

## 5. 本地开发

需要 Node.js 与 npm。Python 仅在刷新数据时需要。

```sh
cd app
npm install
npm run dev
```

Vite 会打印本地访问地址，通常为 `http://localhost:5173`。

生产预览：

```sh
npm run build
npm run preview
```

## 6. 数据职责与刷新

React 运行时会请求以下路径：

```text
/data/connectivity.geojson
/data/facilities.geojson
/data/download_log.json
/data/tc-lam-track.geojson
/data/lam-exercise-scenario.json
```

这些文件在 `app/public/data/` 中受版本控制。

根目录 `data/` 保留以下内容：

- NT Government XLSX 输入；
- 来源网页缓存；
- `communities.json` 补充属性；
- 刷新失败时的离线回退数据。

需要有意刷新公开数据时才运行：

```sh
python -m pip install openpyxl
python scripts/download_data.py
```

脚本会生成 connectivity、facilities 和 source log 到 `app/public/data/`。它不需要、也不应在日常启动、构建或测试 React 时运行。历史轨迹和演练场景由 `app/public/data/` 中的受版本控制文件维护。

## 7. 验证命令

在 `app/` 内执行：

```sh
npm run lint
npm test
npm run build
npm run test:visual
```

视觉测试覆盖 Dashboard 四个演练阶段，以及 Preparedness 和 Data sources 的桌面与移动端快照。

## 8. 已知边界

1. 不是实时系统；数据刷新状态不等同于数据现势或权威确认。
2. 没有后端，准备清单和离线状态仅保存在当前设备。
3. OSM 设施数据可能不完整，地点与服务状态须在当地核实。
4. 轨迹、影响范围、优先级和行动建议是演练/模型输入，不能作为真实事件结论。
5. 地图瓦片不会被完整预下载；仅已访问瓦片可在离线时继续可用。

## 9. 交接检查

- 新成员能够在 `app/` 中启动、构建并运行测试。
- 五个 `/data/...` 路径均返回 200。
- 新成员知道 Python 只用于按需刷新数据，不是启动前置条件。
- 演示时明确区分公开数据、历史背景和模拟输入。
- 仓库中不得提交令牌、个人位置或未经授权的敏感社区数据。
