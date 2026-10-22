# 一纸生花 · 数字剪纸工坊

网页设计竞赛「匠心传成，非遗焕新」作品。第一阶段仅实现页面框架、视觉和基础导航。
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
| 创作工作台 | `/workshop/fold/`、`/workshop/free/`、`/workshop/trace/`、`/workshop/compose/` | 共用布局，不支持真实创作 |
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
    js/app.js                 未开放功能的提示弹窗
    art/                      四份原创 SVG 剪纸示意
  tests.py                    页面、模式入口与占位边界测试
docs/phase-one.md             验收记录与后续边界
```

管理后台地址为 http://127.0.0.1:8000/admin/，需要时执行
`python manage.py createsuperuser` 创建管理员。

检查项目：`python manage.py check`、`python manage.py test`。

本项目无 Node 前端构建链，无需 `npm install` 或 `npm run build`。模板和静态资源由 Django 开发服务器提供。

现有依赖：Django（页面与静态资源）、asgiref（Django 的异步接口依赖）、sqlparse（Django SQL 工具依赖）、tzdata（Windows 时区数据），版本保持 `requirements.txt` 不变。

视觉素材均在项目内以 SVG 几何路径原创绘制；纸感纹理由内联 SVG 噪声生成，字体使用系统宋体及微软雅黑等回退字体。未使用外部图片、字体、模板或 UI 库，无需额外素材授权。

占位范围：绘制、折叠展开、临摹、拼接、撤销重做清空、纸色、作品预览、保存、下载、继续编辑与删除均未实现。点击入口会说明状态；无 localStorage、文件导出或新增业务数据库逻辑。

原项目的 SQLite 与管理后台保留，但本阶段页面不访问作品数据库、不新增账号功能。当前设置用于本地开发。
