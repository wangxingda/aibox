#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${AIBOX_ENV_FILE:-${root_dir}/../shared/.env}"

usage() {
  printf '%s\n' '用法: deploy/manage.sh {build|start|stop|restart|status|logs [服务名]}' \
    '默认读取项目目录同级 shared/.env，可通过 AIBOX_ENV_FILE 指定其他环境文件。' \
    'stop 和 restart 保留数据库及上传文件。build 单独构建镜像。'
}

command_name="${1:-}"
case "$command_name" in
  build|start|stop|restart|status|logs) ;;
  -h|--help|help) usage; exit 0 ;;
  *) usage >&2; exit 2 ;;
esac
if [[ ! -f "$env_file" ]]; then
  printf '环境文件不存在：%s\n请设置 AIBOX_ENV_FILE 或参考 deploy/.env.example。\n' "$env_file" >&2
  exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  printf '%s\n' '未找到 Docker，请先安装 Docker 和 Compose 插件。' >&2
  exit 1
fi
if docker info >/dev/null 2>&1; then
  docker_cmd=(docker)
elif command -v sudo >/dev/null 2>&1; then
  docker_cmd=(sudo docker)
else
  printf '%s\n' '当前用户无法访问 Docker。' >&2
  exit 1
fi
compose=("${docker_cmd[@]}" compose --env-file "$env_file" -f "$root_dir/deploy/compose.yml")
case "$command_name" in
  build) "${compose[@]}" build ;;
  start) "${compose[@]}" up -d --no-build ;;
  stop) "${compose[@]}" stop ;;
  restart)
    "${compose[@]}" stop
    "${compose[@]}" up -d --no-build
    ;;
  status) "${compose[@]}" ps ;;
  logs)
    if [[ -n "${2:-}" ]]; then
      "${compose[@]}" logs -f --tail=100 "$2"
    else
      "${compose[@]}" logs -f --tail=100
    fi
    ;;
esac
