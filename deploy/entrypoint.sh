#!/bin/sh
# 容器启动入口：校验必需环境变量 → 初始化 SQLite（仅 Django 自带表）→ 交给 gunicorn
set -eu

: "${DJANGO_SECRET_KEY:?缺少 DJANGO_SECRET_KEY，请检查 .env}"
: "${DJANGO_ALLOWED_HOSTS:?缺少 DJANGO_ALLOWED_HOSTS，请检查 .env}"

# 业务数据全部在浏览器 localStorage，这里只为 django.contrib 的内置表建库。
# 失败不阻断启动（只读文件系统等场景仍可正常渲染页面）。
python manage.py migrate --noinput --settings=config.settings_prod 2>/dev/null \
  || echo "[warn] migrate 未执行，站点静态渲染不受影响"

exec "$@"
