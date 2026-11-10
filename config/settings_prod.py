"""生产环境配置。仅覆盖部署必需项，不改动任何视图、模板、脚本或交互。

启用方式：DJANGO_SETTINGS_MODULE=config.settings_prod
必需环境变量：
  DJANGO_SECRET_KEY     随机密钥
  DJANGO_ALLOWED_HOSTS  逗号分隔的域名 / 公网 IP
可选：
  DJANGO_CSRF_ORIGINS   逗号分隔的可信来源（含 scheme），如 https://example.com
  DJANGO_SECURE_SSL     设为 1 时开启 HSTS / 安全 Cookie（仅在已启用 HTTPS 时使用）
"""
from .settings import *  # noqa: F401,F403
import os
from django.core.exceptions import ImproperlyConfigured

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', '').strip()
if not SECRET_KEY:
    raise ImproperlyConfigured('生产环境必须设置 DJANGO_SECRET_KEY（见 .env.example）')

DEBUG = False

_hosts = os.environ.get('DJANGO_ALLOWED_HOSTS', '').strip()
if not _hosts:
    raise ImproperlyConfigured('生产环境必须设置 DJANGO_ALLOWED_HOSTS（公网 IP 或域名，逗号分隔）')
ALLOWED_HOSTS = [h.strip() for h in _hosts.split(',') if h.strip()]

CSRF_TRUSTED_ORIGINS = [o.strip() for o in os.environ.get('DJANGO_CSRF_ORIGINS', '').split(',') if o.strip()]

# 静态资源由 nginx 直出（Dockerfile 构建期执行 collectstatic）
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'  # noqa: F405

# 纯 HTTP 访问时不强制 HTTPS；接入 HTTPS 后置 DJANGO_SECURE_SSL=1 即启用。
if os.environ.get('DJANGO_SECURE_SSL') == '1':
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

# 控制台日志，便于 docker compose logs 查看
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {'console': {'class': 'logging.StreamHandler'}},
    'root': {'handlers': ['console'], 'level': 'INFO'},
    'loggers': {
        'django': {'handlers': ['console'], 'level': 'INFO', 'propagate': False},
        'django.request': {'handlers': ['console'], 'level': 'ERROR', 'propagate': False},
        'gunicorn.error': {'handlers': ['console'], 'level': 'INFO', 'propagate': False},
    },
}
