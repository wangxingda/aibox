#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${AIBOX_ENV_FILE:-${root_dir}/../shared/.env}"
backup_root="${AIBOX_BACKUP_DIR:-${root_dir}/../backups}"

usage() {
  printf '%s\n' '用法: deploy/manage.sh {build|start|stop|restart|update|status|logs [服务名]}' \
    '默认读取项目目录同级 shared/.env，可通过 AIBOX_ENV_FILE 指定其他环境文件。' \
    'update 拉取当前分支的最新代码，构建镜像并更新服务；工作区必须干净。' \
    'update 会备份数据库和上传文件并运行数据库迁移；可通过 AIBOX_BACKUP_DIR 指定备份目录。' \
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
    "${compose[@]}" restart api worker frontend
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
    branch=$(git -C "$root_dir" symbolic-ref --quiet --short HEAD)
    upstream_remote=$(git -C "$root_dir" config --get "branch.$branch.remote")
    remote_url=$(git -C "$root_dir" remote get-url "$upstream_remote")
    case "$remote_url" in
      https://github.com/*)
        ssh_url="git@github.com:${remote_url#https://github.com/}"
        git -C "$root_dir" remote set-url "$upstream_remote" "$ssh_url"
        ;;
      ssh://*|*@*:*) ;;
      *) printf '%s\n' '上游仓库必须使用 SSH 地址；请先配置 Git 远端。' >&2; exit 1 ;;
    esac
    git -C "$root_dir" pull --ff-only
    old_images=()
    for image in aibox-api:latest aibox-worker:latest aibox-frontend:latest; do
      if image_id=$("${docker_cmd[@]}" image inspect --format '{{.Id}}' "$image" 2>/dev/null); then
        old_images+=("$image_id")
      fi
    done
    "${compose[@]}" build
    "${compose[@]}" up -d --no-build --wait mysql redis
    "${compose[@]}" stop worker api
    umask 077
    mkdir -p "$backup_root"
    backup_dir=$(mktemp -d "$backup_root/$(date -u +%Y%m%dT%H%M%SZ).XXXXXX")
    printf '备份数据库和上传文件至 %s\n' "$backup_dir"
    "${compose[@]}" exec -T mysql sh -c 'export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; exec mysqldump -u root --single-transaction --routines --triggers --no-tablespaces "$MYSQL_DATABASE"' | gzip > "$backup_dir/mysql.sql.gz"
    gzip -t "$backup_dir/mysql.sql.gz"
    "${compose[@]}" run --rm --no-deps -T api python -c 'import sys, tarfile; t = tarfile.open(fileobj=sys.stdout.buffer, mode="w|gz"); t.add("/app/storage/uploads", arcname="uploads"); t.close()' > "$backup_dir/uploads.tar.gz"
    tar -tzf "$backup_dir/uploads.tar.gz" > /dev/null
    printf '%s\n' '备份校验通过，运行数据库迁移。'
    if ! "${compose[@]}" run --rm --no-deps -T api python -m app.migrate; then
      printf '数据库迁移失败，API 和 worker 保持停止；备份位于 %s。\n' "$backup_dir" >&2
      exit 1
    fi
    "${compose[@]}" up -d --no-build --wait
    dangling_images=$("${docker_cmd[@]}" image ls --quiet --no-trunc --filter dangling=true)
    for image_id in ${old_images[@]+"${old_images[@]}"}; do
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
