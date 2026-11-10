# 一纸生花 · Docker 一键部署说明

适用于腾讯云轻量应用服务器 Ubuntu 22.04 / 24.04，仅公网 IP + HTTP 访问。
业务本身是纯模板渲染，作品数据全部存在浏览器 localStorage，服务端不保存用户作品。

## 一、服务器准备

1. 在腾讯云轻量控制台【防火墙】放行 **TCP 80**（入站）。
2. SSH 登录服务器，确认是 Ubuntu：`cat /etc/os-release`。

## 二、上传部署包

腾讯云轻量 Ubuntu 镜像默认用户是 **`ubuntu`**，不是 `root`；且服务器只接受 SSH 公钥认证。
本机已有专用密钥 `~/.ssh/tencent_lighthouse_ed25519`（**带口令**，会提示输入创建密钥时设置的 passphrase）。

在本机 **PowerShell** 执行：

```powershell
scp -o IdentitiesOnly=yes -i "$env:USERPROFILE\.ssh\tencent_lighthouse_ed25519" `
    "G:\网站学习\.qa\paper-blossoms-deploy.tar.gz" `
    ubuntu@43.142.156.50:/home/ubuntu/
```

> 若提示 `Enter passphrase for key`，输入该密钥的口令即可。
> 若提示 `Permission denied (publickey)`，确认：用户名是 `ubuntu`、用了 `-i` 指定专用密钥、
> 且该公钥已绑定在轻量服务器控制台的「SSH 密钥」中。

登录与解压：

```bash
ssh -o IdentitiesOnly=yes -i "$env:USERPROFILE\.ssh\tencent_lighthouse_ed25519" ubuntu@43.142.156.50
# 登录成功后在服务器上：
cd /home/ubuntu
tar -xzf paper-blossoms-deploy.tar.gz
cd paper-blossoms
```

## 三、一键启动（推荐）

```bash
bash deploy/server-init.sh
```

脚本会自动：检查/安装 Docker 与 compose 插件 → 生成 `.env`（随机密钥 + 自动探测公网 IP）→ 构建镜像 → 启动 → 自检。
普通用户不在 `docker` 组时，脚本会自动对 compose 命令加 `sudo`（此时会提示输入 sudo 密码）。

若自动探测的公网 IP 不准，可显式指定：

```bash
PUBLIC_IP=43.142.156.50 bash deploy/server-init.sh
```

> 脚本会检查 `.env` 是否存在，已存在则保留原值。要重设请先 `rm .env` 再运行。

完成后浏览器访问 `http://<公网IP>/`。

## 四、手工启动（可选）

```bash
cp .env.example .env
python3 -c "import secrets; print(secrets.token_urlsafe(50))"   # 复制输出作为密钥
vim .env        # 填 DJANGO_SECRET_KEY 与 DJANGO_ALLOWED_HOSTS（公网IP,localhost,127.0.0.1）
chmod 600 .env
docker compose up -d --build
```

`.env` 已被 `.gitignore` 忽略，不要提交到仓库。

## 五、常用命令

| 操作 | 命令 |
| --- | --- |
| 查看状态 | `docker compose ps` |
| 查看应用日志 | `docker compose logs -f web` |
| 查看 nginx 日志 | `docker compose logs -f nginx` |
| 重启 | `docker compose restart` |
| 停止 | `docker compose down` |
| 更新代码后重建 | `docker compose up -d --build` |

## 六、验证清单

```bash
curl -I http://127.0.0.1/                                  # 200
curl -I http://127.0.0.1/static/core/js/free-workshop.js  # 200 + Cache-Control: no-cache
curl -I http://127.0.0.1/workshop/free/                    # 200
```

浏览器打开后确认：首页舞台与四模式入口、开场视频、工坊画布为实色红纸、
拖动可剪裁、保存/下载 PNG、我的作品可恢复。

## 七、故障排查

| 现象 | 原因 / 处理 |
| --- | --- |
| `pip install` 卡 60s 后 exit code 1 | 国内直连 `pypi.org` 超时。镜像默认已走腾讯云 PyPI 源；若仍慢，在 `.env` 里设 `PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple` + `PIP_TRUSTED_HOST=pypi.tuna.tsinghua.edu.cn` 后重新 `docker compose build --no-cache web`（见下方说明） |
| `Permission denied (publickey)` | 用户名应为 `ubuntu` 而非 `root`；用 `-i` 指定 `tencent_lighthouse_ed25519`；私钥带口令需输入 passphrase |
| 上传时 `/root/` 被拒 | `ubuntu` 用户无 `/root/` 写权限，上传到 `/home/ubuntu/` |
| 外网打不开，服务器内 `curl` 正常 | 轻量控制台防火墙未放行 TCP 80 |
| 400 Bad Request | `.env` 的 `DJANGO_ALLOWED_HOSTS` 没填真实公网 IP |
| 页面样式全丢 | nginx 容器未构建成功；`docker compose up -d --build` 重建 |
| 改了代码但浏览器还是旧效果 | **Ctrl+Shift+R 硬刷新**。本配置静态资源为 `no-cache`，正常刷新即可生效；如遇旧版本缓存请硬刷 |
| 画布空白/按钮全灰 | 浏览器缓存了旧 JS。硬刷新；仍不行则 `docker compose logs -f web` 查看控制台类报错 |
| 容器起不来 | `docker compose logs web` 看是否缺 `DJANGO_SECRET_KEY` / `DJANGO_ALLOWED_HOSTS` |

## 八、配置说明

- `config/settings_prod.py`：生产配置，`DEBUG=False`，密钥与域名全部读环境变量；原有 `config/settings.py` 与全部业务代码未改动。
- `Dockerfile` 两个 target：`web`（gunicorn）+ `static`（nginx 直出静态资源，视频支持 Range）。
- **pip 镜像源**：构建期默认走腾讯云 PyPI 镜像 `https://mirrors.cloud.tencent.com/pypi/simple`，国内服务器约 7 秒完成，避免直连 `pypi.org` 超时。要换源可在 `.env` 设 `PIP_INDEX_URL` / `PIP_TRUSTED_HOST`（compose 已接为 build args），或 `docker compose build --build-arg PIP_INDEX_URL=... web`。`requirements.txt` 本身未改动。
- `deploy/nginx.conf`：静态资源一律 `Cache-Control: no-cache`。项目静态文件名不带内容哈希，长缓存会导致浏览器复用旧模块、与新版本 `import` 不匹配（曾造成画布失效），因此不做强缓存。
- 静态资源在**镜像构建期**由 `collectstatic` 生成，不依赖运行时卷；nginx 镜像独立持有副本。
- 站点无文件上传，SQLite 仅用于 Django 自带表，业务不依赖；容器重建不影响任何用户作品。

## 九、以后接入域名 / HTTPS

1. 域名完成备案后解析到公网 IP，把域名加入 `DJANGO_ALLOWED_HOSTS`。
2. 在服务器前面终止 TLS（或给 nginx 增加 443 server 块 + 证书），并让反代传 `X-Forwarded-Proto: https`。
3. 在 `.env` 设 `DJANGO_SECURE_SSL=1`，`DJANGO_CSRF_ORIGINS=https://你的域名`，然后 `docker compose up -d`。
4. 该开关会开启 HSTS、安全 Cookie 与 HTTP→HTTPS 跳转；**纯 HTTP 访问时务必保持 `0`**。
