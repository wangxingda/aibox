#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${AIBOX_ENV_FILE:-${root_dir}/../shared/.env}"

usage() {
  printf '%s\n' '用法: deploy/manage.sh {build|start|stop|restart|update|status|logs [服务名]}' \
    '默认读取项目目录同级 shared/.env，可通过 AIBOX_ENV_FILE 指定其他环境文件。' \
    'update 拉取当前分支的最新代码，构建镜像并更新服务；工作区必须干净。' \
    'stop、restart 和 update 保留数据库及上传文件。build 单独构建镜像。'
}

command_name="${1:-}"
case "$command_name" in
  build|start|stop|restart|update|status|logs) ;;
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
  update)
    if [[ -n "$(git -C "$root_dir" status --porcelain)" ]]; then
      printf '%s\n' '工作区有未提交的更改，请先提交或处理后再更新。' >&2
      exit 1
    fi
    if ! git -C "$root_dir" symbolic-ref -q HEAD >/dev/null || ! git -C "$root_dir" rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' >/dev/null 2>&1; then
      printf '%s\n' '当前分支没有上游分支，请先配置 Git 上游。' >&2
      exit 1
    fi
    git -C "$root_dir" pull --ff-only
    old_images=()
    for image in aibox-api:latest aibox-worker:latest aibox-frontend:latest; do
      if image_id=$("${docker_cmd[@]}" image inspect --format '{{.Id}}' "$image" 2>/dev/null); then
        old_images+=("$image_id")
      fi
    done
    "${compose[@]}" build
    "${compose[@]}" up -d --no-build
    dangling_images=$("${docker_cmd[@]}" image ls --quiet --no-trunc --filter dangling=true)
    for image_id in "${old_images[@]}"; do
      if printf '%s\n' "$dangling_images" | grep -Fxq -- "$image_id"; then
        if [[ -z "$("${docker_cmd[@]}" ps -aq --filter "ancestor=$image_id")" ]]; then
          if ! "${docker_cmd[@]}" image rm "$image_id"; then
            printf '旧镜像清理失败：%s\n' "$image_id" >&2
          fi
          dangling_images=$("${docker_cmd[@]}" image ls --quiet --no-trunc --filter dangling=true)
        fi
      fi
    done
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
