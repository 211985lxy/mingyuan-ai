#!/usr/bin/env bash
# 明动 AIM — 客户演示一键启动脚本
#
# 用法:
#   bash scripts/demo-up.sh        # 拉起 MySQL+Redis + 迁移 + seed + 提示启动 web
#   bash scripts/demo-up.sh down   # 停止并清理演示依赖(保留数据卷)
#   bash scripts/demo-up.sh reset  # 完全重置(删数据卷重来)
#
# 本脚本只操作演示专用容器(mingyuan-demo-*),绝不触碰生产/clipflow-prod 库。

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# 演示数据库口令从 .demo-env 读取(不入库、不硬编码)
# shellcheck disable=SC1091
. "$ROOT/apps/web/.demo-env"
: "${CLIPFLOW_DB_PASSWORD:?缺少 CLIPFLOW_DB_PASSWORD,请检查 apps/web/.demo-env}"

COMPOSE="docker compose -f docker-compose.demo.yml --env-file apps/web/.demo-env"
DEMO_DB_URL="mysql://clipflow:${CLIPFLOW_DB_PASSWORD}@127.0.0.1:13306/clipflow"

# 颜色
G() { printf '\033[32m%s\033[0m\n' "$*"; }
Y() { printf '\033[33m%s\033[0m\n' "$*"; }
B() { printf '\033[36m%s\033[0m\n' "$*"; }

case "${1:-up}" in
  down)
    Y "停止演示依赖..."
    $COMPOSE down
    G "✓ 演示依赖已停止(数据卷已保留,下次 up 直接复用)"
    exit 0
    ;;
  reset)
    Y "完全重置演示环境(删数据卷)..."
    $COMPOSE down -v
    G "✓ 已重置,重新运行 bash scripts/demo-up.sh 即可"
    exit 0
    ;;
esac

B "════════════════════════════════════════════"
B "  明动 AIM 演示环境启动"
B "════════════════════════════════════════════"

# 1. 启动依赖容器
B "[1/5] 启动 MySQL + Redis 演示容器..."
$COMPOSE up -d
G "✓ 容器已启动"

# 2. 等待 MySQL 就绪
B "[2/5] 等待 MySQL 就绪..."
for i in $(seq 1 30); do
  if docker exec mingyuan-demo-mysql mysqladmin ping -h localhost -uclipflow -p"$CLIPFLOW_DB_PASSWORD" --silent 2>/dev/null; then
    G "✓ MySQL 就绪"
    break
  fi
  printf "  初始化中 (%d/30)\n" "$i"
  sleep 2
done

# 3. 判断是否需要初始化(首次 / 数据卷为空)
NEED_INIT=0
TABLE_COUNT=$(docker exec mingyuan-demo-mysql mysql -uclipflow -p"$CLIPFLOW_DB_PASSWORD" clipflow -sN \
  -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='clipflow';" 2>/dev/null || echo "0")
if [ "$TABLE_COUNT" -lt 10 ]; then
  NEED_INIT=1
fi

if [ "$NEED_INIT" -eq 1 ]; then
  B "[3/5] 首次初始化:导入 baseline + 标记迁移..."
  docker exec mingyuan-demo-mysql mysql -uclipflow -p"$CLIPFLOW_DB_PASSWORD" -e \
    "DROP DATABASE IF EXISTS clipflow; CREATE DATABASE clipflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null
  docker exec -i mingyuan-demo-mysql mysql -uclipflow -p"$CLIPFLOW_DB_PASSWORD" clipflow \
    < apps/web/prisma/baseline/current.sql 2>/dev/null
  # 标记 baseline 迁移为已应用
  DATABASE_URL="$DEMO_DB_URL" CLIPFLOW_DB_PASSWORD="$CLIPFLOW_DB_PASSWORD" node -e '
    const fs=require("fs"),mysql=require("mysql2/promise");
    (async()=>{
      const m=JSON.parse(fs.readFileSync("apps/web/prisma/baseline/migrations.json","utf8"));
      const c=await mysql.createConnection({host:"127.0.0.1",port:13306,user:"clipflow",password:process.env.CLIPFLOW_DB_PASSWORD,database:"clipflow"});
      await c.query(`CREATE TABLE IF NOT EXISTS \`_prisma_migrations\` (id VARCHAR(36) NOT NULL, migration_name VARCHAR(255) NOT NULL, finished_at DATETIME(3) NULL, rolled_back_at DATETIME(3) NULL, checksum VARCHAR(64) NOT NULL, logs TEXT NULL, started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), applied_steps_count INT UNSIGNED NOT NULL DEFAULT 0, PRIMARY KEY (id), UNIQUE INDEX \`_prisma_migrations_name_idx\`(\`migration_name\`)) ENGINE=InnoDB;`);
      for(const n of m){await c.query("INSERT INTO `_prisma_migrations`(id,migration_name,finished_at,checksum,applied_steps_count) VALUES(UUID(),?,NOW(),?,1) ON DUPLICATE KEY UPDATE finished_at=NOW()",[n,"baseline-"+n.slice(0,8)]);}
      await c.end();console.log("  baseline 迁移已标记");
    })();' 2>/dev/null
  G "✓ baseline 已导入"
else
  B "[3/5] 数据已存在,跳过初始化"
fi

# 4. 跑增量迁移
B "[4/5] 应用数据库迁移..."
( cd apps/web && DATABASE_URL="$DEMO_DB_URL" npx prisma migrate deploy >/dev/null 2>&1 ) && G "✓ 迁移已是最新" || Y "! 部分迁移需手动处理(见文档)"

# 5. Seed 演示数据
B "[5/5] 灌入演示数据..."
( cd apps/web && DATABASE_URL="$DEMO_DB_URL" npx prisma db seed >/dev/null 2>&1 ) || true
( cd apps/web && DATABASE_URL="$DEMO_DB_URL" npx tsx prisma/seed-demo.ts 2>&1 | tail -6 )
G "✓ 演示数据就绪"

echo ""
B "════════════════════════════════════════════"
G "  ✓ 演示环境就绪!"
B "════════════════════════════════════════════"
echo ""
echo "下一步:启动 Web 应用"
echo "  cd apps/web && npm run dev"
echo "  浏览器打开 http://localhost:3000"
echo "  演示登录账号: demo@mingyuan.ai"
echo ""
echo "演示动线请参考: 演示动线.md"
