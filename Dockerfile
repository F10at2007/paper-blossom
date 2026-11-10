# 一纸生花 · 生产镜像
# 两个 target：web = gunicorn 跑模板渲染；static = nginx 直出静态资源（含视频）
# 构建：docker compose build   启动：docker compose up -d

# ---------------------------------------------------------------- web ---
FROM python:3.12-slim AS web

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=config.settings_prod

WORKDIR /app

COPY requirements.txt ./
COPY deploy/requirements.prod.txt ./deploy/requirements.prod.txt

# 国内服务器直连 pypi.org 常超时（典型 65s 后失败）。默认用腾讯云 PyPI 镜像，
# 与轻量服务器同内网最快；其它环境可用 --build-arg PIP_INDEX_URL=... 覆盖。
ARG PIP_INDEX_URL=https://mirrors.cloud.tencent.com/pypi/simple
ARG PIP_TRUSTED_HOST=mirrors.cloud.tencent.com
RUN pip install --no-cache-dir \
    --index-url "${PIP_INDEX_URL}" \
    --trusted-host "${PIP_TRUSTED_HOST}" \
    --timeout 60 --retries 5 \
    -r requirements.txt -r deploy/requirements.prod.txt

COPY . .

# 仅构建期给占位值，镜像内不保留任何密钥；运行时由 .env 注入真实值
RUN DJANGO_SECRET_KEY=build-time-placeholder \
    DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1 \
    python manage.py collectstatic --noinput --settings=config.settings_prod

# 用数字 UID 运行（不依赖镜像里是否存在 useradd/groupadd）
RUN chmod -R a+rX /app && chown -R 10001:10001 /app
USER 10001:10001

EXPOSE 8000
ENTRYPOINT ["sh", "/app/deploy/entrypoint.sh"]
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", \
     "--workers", "2", "--threads", "2", "--timeout", "60", \
     "--keep-alive", "5", "--access-logfile", "-", "--error-logfile", "-"]

# ------------------------------------------------------------- static ---
FROM nginx:1.27-alpine AS static

# 静态资源直接打进 nginx 镜像，运行时不依赖共享卷
COPY --from=web /app/staticfiles /usr/share/nginx/html/static
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
