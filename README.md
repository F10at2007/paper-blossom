# 一纸生花 · 数字剪纸工坊

网页设计竞赛「匠心传成，非遗焕新」作品。第一阶段完成框架，第二阶段已实现自由剪艺与透明 PNG 下载。
沿用 Python 3.12 + Django 6.1.2，模板 + 自主 CSS + 原生 JavaScript，无新增依赖。

在项目目录打开 PowerShell，执行：

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

浏览器访问 http://127.0.0.1:8000/ 查看首页。已有 `.venv` 和依赖时可直接激活并启动。

| 页面 | 地址 | 当前范围 |
| --- | --- | --- |
| 首页 | `/` | 品牌主视觉、四种模式、文化介绍 |
| 模式选择 | `/modes/` | 四种模式独立入口 |
| 自由剪艺 | `/workshop/free/` | 真实自由剪裁、撤销重做、换色、预览、PNG 下载 |
| 其他工作台 | `/workshop/fold/`、`/workshop/trace/`、`/workshop/compose/` | 共用布局，仅静态示意 |
| 我的作品 | `/works/` | 空状态及明确标记的示例卡片 |

```text
config/                       原有 Django 配置
core/
  modes.py                    四模式名称、介绍、工具、纹样的唯一数据源
  views.py / urls.py          只读页面渲染与导航
  templates/core/
    base.html                 共用页壳、页脚、占位提示弹窗
    index.html                Home
    modes.html                ModeSelection
    workshop.html             Workshop（四模式共用）
    works.html                MyWorks
    components/               Navbar、ModeCard、WorkspaceToolbar
  static/core/
    css/site.css              原创样式与响应式布局
    css/free-workshop.css     自由剪艺画布与控制状态
    js/app.js                 未开放功能的提示弹窗
    js/free-paper.js          剪裁历史、透明渲染、PNG 编码
    js/free-workshop.js       指针事件、工具和下载交互
    art/                      四份原创 SVG 剪纸示意
  tests.py                    页面、模式入口与占位边界测试
docs/phase-one.md             验收记录与后续边界
docs/phase-two.md             自由剪艺实现与验收记录
tests/                       原生 Node 单元测试及 Chrome 浏览器验收脚本
```

管理后台地址为 http://127.0.0.1:8000/admin/，需要时执行
`python manage.py createsuperuser` 创建管理员。

检查项目：`python manage.py check`、`python manage.py test`。

自由剪艺：用鼠标或单指画出轮廓，松手后自动连接首尾，**圈内的纸会被剪去**。棋盘格表示透明，不会出现在导出图片中。支持撤销、重做、清空确认和四种纸色，点击下载获得 2048×2048 透明 PNG。路径只保留在当前页面内，刷新或离开页面会丢失；本地作品保存仍未开放。

可选开发检查（Node 22+，不需安装 npm 依赖）：

```powershell
node --test tests/free-paper.test.mjs
node --check core/static/core/js/free-workshop.js
```

完整浏览器验收方法见 `docs/phase-two.md`。Chrome 测试程序与截图仅存放在忽略的 `.qa/`，不属于网站依赖。

本项目无 Node 前端构建链，无需 `npm install` 或 `npm run build`。模板和静态资源由 Django 开发服务器提供。

现有依赖：Django（页面与静态资源）、asgiref（Django 的异步接口依赖）、sqlparse（Django SQL 工具依赖）、tzdata（Windows 时区数据），版本保持 `requirements.txt` 不变。

视觉素材均在项目内以 SVG 几何路径原创绘制；纸感纹理由内联 SVG 噪声生成，字体使用系统宋体及微软雅黑等回退字体。未使用外部图片、字体、模板或 UI 库，无需额外素材授权。

占位范围：其他三模式的玩法及操作、本地保存作品、继续编辑与删除。未实现 localStorage、自动保存或新增业务数据库逻辑。自由剪艺的绘制、剪裁、历史、纸色、预览与 PNG 下载已可使用。

原项目的 SQLite 与管理后台保留，但本阶段页面不访问作品数据库、不新增账号功能。当前设置用于本地开发。
