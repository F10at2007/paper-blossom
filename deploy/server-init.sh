#!/usr/bin/env bash
# 腾讯云轻量应用服务器（Ubuntu 22.04/24.04）一键初始化
# 用法：在项目根目录执行  bash deploy/server-init.sh
# 前置：控制台防火墙已放行 TCP 80
# 兼容：以 ubuntu 或 root 登录均可；支持 PUBLIC_IP 环境变量指定公网 IP
set -euo pipefail

cd "$(dirname "$0")/.."

# 普通用户不在 docker 组时走 sudo；已在组里或本来就是 root 则直接执行
dc() {
  if docker info >/dev/null 2>&1; then
    docker compose "$@"
  else
    sudo docker compose "$@"
  fi
}

echo "==> [1/5] 检查 Docker"
if ! command -v docker >/dev/null 2>&1; then
  echo "    未安装 Docker，优先使用 Ubuntu 源（国内速度快）..."
  sudo apt-get update -qq
  if ! sudo apt-get install -y -qq docker.io docker-compose-v2; then
    echo "    Ubuntu 源安装失败，改用 Docker 官方脚本..."
    curl -fsSL https://get.docker.com | sudo sh
  fi
fi
if ! docker info >/dev/null 2>&1; then
  sudo systemctl enable --now docker >/dev/null 2>&1 || sudo service docker start >/dev/null 2>&1 || true
fi
if ! dc version >/dev/null 2>&1; then
  echo "    缺少 compose 插件，正在安装..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq docker-compose-v2 \
    || sudo apt-get install -y -qq docker-compose-plugin
fi
docker --version
dc version

echo "==> [2/5] 生成 .env"
if [ -f .env ]; then
  echo "    .env 已存在，保留原值（如需重设密钥请先备份并删除 .env）"
  IP="$(sed -n 's/^DJANGO_ALLOWED_HOSTS=//p' .env | cut -d, -f1)"
else
  SECRET="$(python3 -c 'import secrets; print(secrets.token_urlsafe(50))' 2>/dev/null || openssl rand -base64 48)"
  # 优先级：显式传入 > 腾讯云 metadata > 外部服务 > 手工输入
  IP="${PUBLIC_IP:-}"
  if [ -z "$IP" ]; then
    IP="$(curl -fsS --max-time 3 http://metadata.tencentyun.com/latest/meta-data/public-ipv4 2>/dev/null || true)"
  fi
  if [ -z "$IP" ]; then
    IP="$(curl -fsS --max-time 3 https://api.ipify.org 2>/dev/null || true)"
  fi
  if [ -z "$IP" ]; then
    read -r -p "    无法自动获取公网 IP，请输入轻量服务器公网 IP: " IP
  fi
  cat > .env <<EOF
DJANGO_SECRET_KEY=${SECRET}
DJANGO_ALLOWED_HOSTS=${IP},localhost,127.0.0.1
DJANGO_CSRF_ORIGINS=
DJANGO_SECURE_SSL=0
EOF
  chmod 600 .env
  echo "    已写入 .env，ALLOWED_HOSTS = ${IP},localhost,127.0.0.1"
fi

echo "==> [3/5] 构建镜像（首次约 2-5 分钟）"
dc build

echo "==> [4/5] 启动服务"
dc up -d

echo "==> [5/5] 等待就绪并自检"
for i in $(seq 1 30); do
  if curl -fsS -o /dev/null --max-time 3 "http://127.0.0.1/"; then
    echo "    站点已就绪"
    break
  fi
  sleep 2
done
curl -sS -o /dev/null -w "    首页 HTTP %{http_code}\n" --max-time 5 "http://127.0.0.1/" || true
dc ps

echo ""
echo "完成。浏览器访问 http://${IP:-<公网IP>}/"
echo "注意：还需在腾讯云轻量控制台【防火墙】放行 TCP 80，否则外网无法访问。"
echo "常用命令（普通用户若提示权限，在前面加 sudo）："
echo "  docker compose logs -f web     # 查看应用日志"
echo "  docker compose restart         # 重启"
echo "  docker compose down            # 停止"
echo "  docker compose up -d --build   # 更新代码后重新构建"
