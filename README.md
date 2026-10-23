# 一纸生花 · 数字剪纸工坊

网页设计竞赛「匠心传成，非遗焕新」作品。四种创作模式、透明 PNG 导出及本地作品管理现已实现。

沿用 **Python 3.12 + Django 6.1.2 + 原生 JavaScript / Canvas 2D + 自主 CSS**。没有 React/Vite 构建链，没有新增第三方绘图库或 UI 库。

## 启动与检查

当前项目已有 `.venv`，在项目目录打开 PowerShell：

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

访问 http://127.0.0.1:8000/ 。已有依赖时可省略安装；数据库迁移沿用原项目，仅供既有 Django 配置使用，用户作品不写入数据库。

全新机器请先安装 Python 3.12 或兼容版本，并运行 `python -m venv .venv` 创建环境。更新代码后，已打开的旧页面可按 Ctrl+F5 刷新脚本缓存。

```powershell
python manage.py check
python manage.py test
python manage.py collectstatic --noinput
```

无需 npm 安装或前端编译；collectstatic 将静态资源收集到已忽略的 `staticfiles/`。当前设置用于本地比赛演示，公网部署需另行配置密钥、DEBUG、域名和服务器。

## 四种模式

| 页面 | 地址 | 操作 |
| --- | --- | --- |
| 工坊首页 | `/` | 品牌介绍、四模式入口与剪纸文化背景 |
| 模式选择 | `/modes/` | 选择创作方式 |
| 折纸成花 | `/workshop/fold/` | 水平/垂直对折、四折、八折；纸片居中，可从纸外起笔，展开后才显示完整作品并启用下载 |
| 自由剪艺 | `/workshop/free/` | 画出轮廓，松手自动闭合，圈内真正镂空；撤销、重做、清空、换色、预览 |
| 纹样临摹 | `/workshop/trace/` | 三幅分级原创参考图；独立参考图与可开关的画布虚线辅助、对比、完成/继续；导出只含用户作品 |
| 百纹成画 | `/workshop/compose/` | 花卉、动物、几何、边框共十二款原创纹样；添加、拖动、缩放、旋转、删除、取消选择、撤销重做与预览 |
| 我的作品 | `/works/` | 缩略图、筛选、恢复编辑、重命名、下载、删除及本地备份 |

四模式均支持 **2048×2048 透明 PNG**。导出不包含网页、参考图、棋盘格、折痕或选择框。拼接模式将独立的镂空纸片叠放，超出方形画布的部分按画布边界裁去。

## 创作辅助

- 四种模式均可“放大画布”，收起素材/工具侧栏，扩大纸张；退出放大或按 Escape 恢复。放大不改变作品数据与导出分辨率。
- 临摹画布默认显示当前参考图的虚线轮廓，支持隐藏/显示；完成时隐藏，继续临摹时恢复。辅助层不保存为剪裁、不进入缩略图、对比作品或 PNG。
- 快捷键：Ctrl（Mac 为 ⌘）+ Z 撤销，Ctrl/⌘ + Shift + Z 或 Ctrl/⌘ + Y 重做，Ctrl/⌘ + S 保存，Ctrl/⌘ + Shift + S 另存副本。输入框和打开的弹窗内不会触发创作快捷键，绘制中遵循操作按钮的禁用状态。
- 保存后继续修改会显示“有未保存修改”；撤销回已保存状态后恢复“已保存”。

## 本地保存

- 点击“保存作品”并命名；已有作品再次保存会更新同一记录及修改时间。
- 保存可编辑数据：自由剪裁路径，折叠基础路径/折法/视图，临摹参考 ID/用户路径/完成状态，拼接素材 ID/位置/大小/角度，以及纸色。
- “另存副本”创建独立作品，不覆盖原件。同一作品在其他页面修改或删除后，旧页面保存会被阻止；当前画布保留，可直接另存副本。
- 从“我的作品”恢复正确模式，继续修改后手动保存。有未保存修改时显示状态，并在站内离开、浏览器刷新/关闭时提醒；确认离开仍会丢失修改，没有自动保存。浏览器关闭提醒受浏览器限制，不能替代手动保存。
- 记录仅保存在**当前浏览器、当前站点地址**的 localStorage；`localhost` 与 `127.0.0.1`、不同端口分别拥有独立记录。不会上传，不跨设备同步，清理浏览器数据会导致记录丢失。
- 最多 30 幅作品，存储内容上限 150 万字符；缩略图仅 160×160，单项也有体积保护。写入失败会提示并保留旧记录。
- 可“导出备份”下载包含编辑数据的 JSON。“导入备份”校验通过并确认后替换本地记录。导入是本地读取，不上传文件。PNG 只能保存最终图像，不能替代可编辑 JSON。
- 数据损坏时保留原始记录供备份，不会静默清空；仍可返回工坊创作、下载 PNG，或导入有效备份。

## 结构与复用

```text
core/
  modes.py                         四模式介绍与入口元数据
  templates/core/                   首页、模式页、共用工作台、作品页
    components/                    导航、模式卡片、工具、共用画布、参考图与对比
  static/core/
    css/                           原创纸感样式、响应式及模式样式
    js/free-paper.js               剪裁历史、透明渲染、PNG 编码
    js/free-workshop.js            自由/折纸/临摹共用绘制控制器
    js/fold-paper.js               折叠裁剪、显示逆变换和几何展开
    js/patterns.js                 三份原创参考图、十二款原创纸片
    js/trace-workshop.js           临摹选择、对比与完成流程
    js/composition-model.js        独立纸片渲染与操作历史
    js/compose-workshop.js         拼接操作控制器
    js/work-store.js               版本、几何、容量校验及本地记录 CRUD
    js/work-document.js            四模式保存数据的统一最终渲染
    js/work-persistence.js         共用手动保存和恢复
    js/my-works.js                 真实作品列表、下载、备份及导入
    js/paper-download.js           四模式共用 PNG 下载与 Blob URL 清理
    art/                           首页原创 SVG 示意图
  tests.py                         页面与集成边界检查
tests/                             原生 Node 及 Chrome CDP 验收脚本
docs/                              各阶段交付记录与最终验收报告
```

## 依赖与素材

| 依赖 | 用途 |
| --- | --- |
| Django 6.1.2 | 既有 URL、模板与静态资源服务 |
| asgiref 3.12.1 | Django 的 ASGI 依赖 |
| sqlparse 0.6.0 | Django SQL 解析依赖，游戏不新增数据库逻辑 |
| tzdata 2026.5 | Windows 时区数据 |

版本保持 `requirements.txt` 不变。Node 22+ 与 Chrome for Testing 仅用于可选开发验收，不是网站运行依赖。没有外部图片、字体下载、视频或远程绘图库。

SVG、参考图和拼接纸片均为本项目原创几何素材，名称为练习名称，不编造传统纹样寓意。文化背景的入选年份与一般介绍依据 [UNESCO 中国剪纸项目页](https://ich.unesco.org/en/RL/chinese-paper-cut-00219)；未使用该网站的图片、视频或纹样。

## 复现验收

```powershell
node --test tests/free-paper.test.mjs tests/fold-paper.test.mjs tests/work-store.test.mjs
```

浏览器验收需要先启动 Django，并启动独立的 Chrome 129 测试配置（9222 端口），随后**顺序**执行：

```powershell
node tests/browser-refinements.mjs
node tests/browser-phase-four.mjs
node tests/browser-fold-cut.mjs
node tests/browser-free-cut.mjs
```

脚本基于 Node 内置 WebSocket 和 Chrome DevTools Protocol，无 npm 依赖。不要对日常浏览器配置运行验收。第四阶段脚本仅在隔离测试浏览器中写入验收作品，并在结束时恢复测试前的作品记录。截图、下载与报告位于忽略目录 `.qa/`，不会随源码提交。

最终功能、文件清单和验证边界见 [第四阶段交付与验收](docs/phase-four.md)。第一至第三阶段文档保留历史记录，其旧的占位范围以本 README 和第四阶段文档为准。

尚未进行实体触屏手工验证或大量路径压力测试。没有 AI 评分、账号、云端同步、复杂解锁或高级图层系统。

本轮修复、文件清单及测试结果见 [交互优化验收](docs/interaction-refinements.md)。

## 百纹成画矩形选框

模式四按纹样实际外轮廓计算随元素旋转的矩形框。点击矩形范围选中，框内（包括透明部分）拖动可移动；四角拖动以元素中心为基准等比缩放，大小限制仍为 8%–80%。重叠时矩形命中优先选择最上层，已选元素的角点优先响应缩放。点击框外空白取消选择。

移动和缩放每次松手只记一次历史，窗口失焦、触控取消或画布尺寸变化会撤回未完成操作。原有旋转按钮、保存恢复、撤销重做、预览和 PNG 保持可用。选框和控制点只绘制在辅助画布中。

新增验收：`node --test tests/composition-box.test.mjs`；启动独立测试浏览器后运行 `node tests/browser-composition-box.mjs`。详见 [矩形选框验收记录](docs/composition-box.md)。
