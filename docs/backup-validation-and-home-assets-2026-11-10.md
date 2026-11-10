# 备份校验与首页资源加载修复验收

日期：2026-11-10

## 修改内容

- `core/static/core/js/work-store.js`：共享文档校验要求 `mode`、`foldMode`、参考图和素材标识为字符串；按模式核验剪裁路径、折叠状态、临摹完成状态，以及拼接元素的 ID、位置、大小和旋转。校验失败指出作品序号、名称和字段；读取、保存、恢复和导入共用同一规则。合法空白作品和已有折法保留。
- `core/templates/core/home.html`、`core/static/core/js/pop-defer.js`、`core/static/core/css/warm.css`：桌面舞台断点统一为宽度大于 900px。移动布局不预加载舞台背景、标题或悬停裁件；桌面背景预加载按 901–1080、1081–1679、1680px 以上匹配 CSS。标题和悬停裁件在桌面条件满足后补载，运行时切到桌面布局会补载一次，之后缩放往返不重复请求。
- `tests/work-store.test.mjs`、`core/tests.py`、`tests/browser-import-and-home.mjs`：增加恶意/错误字段、旧折法、最后一幅损坏、首页断点、真实文件导入、取消/写入失败及网络资源验收。
- `tests/browser-free-cut.mjs`：将资源 URL 清理等待上限扩至 15 秒（业务定时器为 10 秒）；首页完整性检查只要求当前可见图片已加载，允许隐藏的懒加载卡片不下载。
- `README.md`：加入本轮复现入口。

`core/static/core/js/my-works.js` 已检查，无需修改：它已先通过共享 `readWorks()` 校验整份文件，再显示替换确认，确认后才一次性写入原始 JSON。错误提示与严格性由共享校验器修复。

## 备份验收

### 实测

- Chrome for Testing `129.0.6668.100`，全新隔离配置，作品页真实文件输入选择错误 JSON；第一幅作品的数组 `mode` 报错并标明 `mode` 字段，未弹出替换确认。导入前后 localStorage 原始字符串逐字符相同。
- 合法备份通过作品页导入后，四模式分别恢复、切换纸色、保存并再次从记录读取，全部成功。
- 用户取消替换确认及模拟 `localStorage.setItem` 抛出配额异常后，原记录字符串仍保持不变。

### 单元覆盖

- `mode: ["free"]`、数组 `foldMode`、未知拼接素材、未知参考图、缺少路径几何字段和多幅作品中仅最后一幅损坏，均被拒绝；最后一幅错误显示对应序号与具体字段。
- 四种模式合法文档及 `vertical`、`horizontal`、`quarter`、`eighth`、`radial3`、`radial6` 折法均完成保存、读取、继续修改和再次保存。
- 空白自由作品和空路径旧折法可通过校验。

## 首页网络验收

环境：Chrome for Testing 129 headless、禁用缓存、每个宽度从空白页冷导航；滚动到移动模式卡片以触发其懒加载，然后记录图片请求的 `Network.loadingFinished.encodedDataLength`。视口宽度 900px 仍是移动布局，901px 切换为桌面舞台。

| 视口 | 实际图片请求与传输字节 | 总计 |
| --- | --- | ---: |
| 720 | `card-symmetry.webp` 123,526；`card-free.webp` 98,325；`card-trace.webp` 102,153；`card-compose.webp` 99,470 | 423,474 B |
| 900 | 同 720px 的四张移动卡片 | 423,474 B |
| 901 | `bg-stage-1080.webp` 143,680；`bg-stage-1080-lq.webp` 1,797；`title-brush.webp` 91,399；四张 `*-pop.webp` 共 448,993 | 685,869 B |
| 1440 | `bg-stage-1440.webp` 205,180；`bg-stage-1440-lq.webp` 2,495；`title-brush.webp` 91,399；四张 `*-pop.webp` 共 448,993 | 748,067 B |
| 1920 | `bg-stage-1920.webp` 163,774；`title-brush.webp` 91,399；四张 `*-pop.webp` 共 448,993 | 704,166 B |

720px 和 900px 均没有舞台背景、舞台标题图或四张悬停裁件请求。四张移动卡片显示，四个入口均返回 HTTP 200。此前审计记录的桌面 720 背景与四张裁件合计 528,620 B，移动视口节省 **528,620 B，约 516.2 KiB**；同一 Chrome 129 下额外实测隐藏标题图减少 91,399 B。按这六项合计，移动首页少传 **620,019 B，约 605.5 KiB**，移动卡片仍按需加载。

桌面下真实鼠标移动和键盘 Tab 聚焦均使悬停裁件不透明度达到 1，键盘焦点轮廓为实线。720→1440→720→1440 动态切换时四张裁件各仅请求一次。

## 测试结果

- 实测 Node 单元测试：`node --test tests/*.test.mjs`，26 项通过。
- 实测 Django：`.venv/Scripts/python.exe manage.py test`，5 项通过；`manage.py check` 无问题。
- 实测 Chrome 129 浏览器回归：交互优化 46、第四阶段 74、折纸 41、自由剪艺 59、团花 46、拼接选框 24 项通过，共 290 项；测试报告均无页面错误。
- 专项 Chrome 129：首页冷启动网络、窄宽切换、真实文件导入和四模式导入后继续编辑/保存通过。机器记录：`.qa/import-home-1794305140182/report.json`。

## 验收边界

- 视口和方向变化通过 Chrome DevTools 的尺寸模拟测试，未用实体手机或实体旋转设备测试。
- 存储写入失败通过注入 `QuotaExceededError` 模拟；没有耗尽真实浏览器磁盘配额。
- 旧折法兼容由当前历史模式结构和空路径记录验证；未覆盖所有来源不明的外部旧备份文件。
- 未改首页视频门厅、折叠几何、PNG 渲染或其他业务功能；未新增依赖，未提交 Git。
