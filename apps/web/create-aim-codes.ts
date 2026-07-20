import { config } from "dotenv";
import { writeFileSync } from "fs";
import { PrismaClient } from "./src/generated/prisma/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import crypto from "crypto";

// 显式加载 .env.local（与 prisma.config.ts 一致）
config({ path: ".env.local" });

const COUNT = 20;
const DURATION_DAYS = 365; // 激活后有效期（天）。按需修改：试用可设 30，买断可设 3650。
const ADMIN_EMAIL = "admin@mingyuan.ai";
const OUTPUT_MD = "/Users/xiangyu/Desktop/明动aim智能体/激活码清单_2026-07-20.md";

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required (未在 .env.local 找到)");
  const url = new URL(databaseUrl.replace(/^mysql:\/\//, "mariadb://"));
  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: parseInt(url.port || "3306", 10),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
    }),
  });
}

const prisma = createPrismaClient();

// 去歧义字符集：去掉 0/O/1/I/L，避免人工抄录出错
const CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomGroup(len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += CHARSET[crypto.randomInt(0, CHARSET.length)];
  return s;
}

function generateCode(): string {
  return `AIM-${randomGroup(4)}-${randomGroup(4)}`;
}

async function main() {
  const admin = await prisma.adminUser.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!admin) throw new Error(`请先创建管理员账号: ${ADMIN_EMAIL}`);

  const batchId = crypto.randomUUID();
  const batchNote = `明动AIM 注册激活码 · ${new Date().toISOString().slice(0, 10)}`;
  console.log(`📧 创建者: ${admin.email}`);
  console.log(`🆔 批次: ${batchId}`);
  console.log(`📝 备注: ${batchNote} | 有效期: ${DURATION_DAYS} 天 | 数量: ${COUNT}\n`);

  const created: string[] = [];
  const skipped: string[] = [];

  while (created.length < COUNT) {
    const code = generateCode();
    if (created.includes(code)) continue; // 批次内去重
    const existing = await prisma.activationCode.findUnique({ where: { code } });
    if (existing) {
      skipped.push(code);
      continue; // 库内已存在，换一个
    }
    await prisma.activationCode.create({
      data: {
        code,
        batchId,
        batchNote,
        durationDays: DURATION_DAYS,
        status: "unused",
        createdBy: admin.id,
      },
    });
    created.push(code);
    console.log(`✅ ${code}`);
  }

  console.log(`\n🎉 完成：成功写入 ${created.length} 个，库内已存在跳过 ${skipped.length} 个`);

  const md =
    `# 明动AIM 注册激活码清单\n\n` +
    `- 生成时间：${new Date().toLocaleString("zh-CN")}\n` +
    `- 批次 ID：${batchId}\n` +
    `- 批次备注：${batchNote}\n` +
    `- 激活后有效期：${DURATION_DAYS} 天\n` +
    `- 数量：${created.length} 个\n` +
    `- 状态：全部 unused（未使用）\n\n` +
    `## 激活码\n\n` +
    created.map((c, i) => `${i + 1}. \`${c}\``).join("\n") +
    `\n\n## 使用方式\n\n` +
    `1. 注册账号：http://localhost:3000/register\n` +
    `2. 登录后访问：http://localhost:3000/activate\n` +
    `3. 输入上方激活码完成激活\n`;

  writeFileSync(OUTPUT_MD, md, "utf8");
  console.log(`📄 清单已导出：${OUTPUT_MD}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ 错误:", e);
  await prisma.$disconnect();
  process.exit(1);
});
