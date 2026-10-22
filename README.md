# 网站学习

Python 3.12，Django 项目配置为 `config`，初始应用为 `core`。

在项目目录打开 PowerShell，执行：

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

浏览器访问 http://127.0.0.1:8000/ 查看首页。

管理后台地址为 http://127.0.0.1:8000/admin/，需要时执行
`python manage.py createsuperuser` 创建管理员。

检查项目：`python manage.py check`。

当前使用 SQLite 数据库、简体中文和 Asia/Shanghai 时区，配置用于本地开发。
