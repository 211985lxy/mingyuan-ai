# 明远AIM 快速上线清单

目标：先上线一个可用版本，覆盖登录、客户项目、AIM 改文案、AIM 短视频内容生产。

## 1. 服务器最低配置

- Ubuntu 22.04 / 24.04
- 2C4G 起步
- Docker + Docker Compose
- Nginx
- 一个已解析到服务器的域名（例如 `mingyuan-ai.com`）

## 2. 安装基础软件

```bash
apt update && apt upgrade -y
apt install -y git nginx docker.io docker-compose-plugin certbot python3-certbot-nginx
systemctl enable --now docker nginx
```

## 3. 上传代码

```bash
mkdir -p /var/www/mingyuan
cd /var/www/mingyuan
git clone <your-repo-url> .
cd mingyuan
```

如果没有 Git 仓库，先用 `scp` 或服务器面板上传整个项目目录。

## 4. 配置生产环境变量

```bash
cd /var/www/mingyuan/mingyuan
cp apps/web/.env.production.example apps/web/.env.production
nano apps/web/.env.production
```

必须填写：

```bash
MYSQL_ROOT_PASSWORD
MYSQL_PASSWORD
JWT_SECRET
ADMIN_JWT_SECRET
ADMIN_EMAIL
ADMIN_PASSWORD
THEROUTER_API_KEY 或 DEEPSEEK_API_KEY 或 OPENAI_API_KEY
CRON_SECRET
```

生成随机密钥：

```bash
openssl rand -base64 32
```

## 5. 启动服务

先校验配置：

```bash
cd /var/www/mingyuan/mingyuan
docker compose --env-file apps/web/.env.production -f docker-compose.prod.yml config >/tmp/mingyuan-compose-check.yml
```

本地如果只想用示例文件检查 compose 语法：

```bash
MINGYUAN_WEB_ENV_FILE=./apps/web/.env.production.example \
docker compose --env-file apps/web/.env.production.example -f docker-compose.prod.yml config >/tmp/mingyuan-compose-check.yml
```

```bash
cd /var/www/mingyuan/mingyuan
docker compose --env-file apps/web/.env.production -f docker-compose.prod.yml up -d --build
```

检查：

```bash
docker ps
curl -I http://127.0.0.1:3000/login
```

## 6. 初始化数据库

```bash
docker compose --env-file apps/web/.env.production -f docker-compose.prod.yml exec web sh -lc "cd apps/web && npx prisma db push && pnpm prisma db seed"
```

如果 seed 不可用，至少先执行：

```bash
docker compose --env-file apps/web/.env.production -f docker-compose.prod.yml exec web sh -lc "cd apps/web && npx prisma db push"
```

## 7. 配置 Nginx

```bash
cp infra/nginx.mingyuan.conf /etc/nginx/sites-available/mingyuan
nano /etc/nginx/sites-available/mingyuan
```

把 `mingyuan-ai.com` 改成你最终绑定的真实域名。

```bash
ln -sf /etc/nginx/sites-available/mingyuan /etc/nginx/sites-enabled/mingyuan
nginx -t
systemctl reload nginx
```

## 8. 配置 HTTPS

```bash
certbot --nginx -d mingyuan-ai.com
certbot renew --dry-run
```

## 9. 上线验收

打开：

```text
https://mingyuan-ai.com/login
https://mingyuan-ai.com/admin/login
https://mingyuan-ai.com/home
https://mingyuan-ai.com/projects
https://mingyuan-ai.com/aim
```

必须验证：

- 能注册 / 登录
- 能进入后台
- 能创建客户项目
- AIM 能改文案
- AIM 能生成短视频内容
- 最近内容状态能切换

## 10. 当前不建议上线前继续做的事

- 不继续扩展热点、对标和自动发布等非核心能力。
- 不重构全部旧页面。
- 不接复杂自动化。

第一版只验证：客户项目 + 改文案 + 短视频内容生成 + 状态推进。
