import { PrismaClient } from './src/generated/prisma/client.js';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import crypto from 'crypto';

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error("DATABASE_URL is required")
  const url = new URL(databaseUrl.replace(/^mysql:\/\//, "mariadb://"))

  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: parseInt(url.port || "3306", 10),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
    }),
  })
}

const prisma = createPrismaClient();

async function createActivationCodes() {
  try {
    // 使用现有管理员作为创建者，脚本不得创建免密码账号。
    const adminEmail = 'admin@mingyuan.ai';
    const admin = await prisma.adminUser.findUnique({ where: { email: adminEmail } });
    if (!admin) throw new Error(`请先创建管理员账号: ${adminEmail}`)

    const creatorId = admin.id;
    console.log(`📧 使用系统管理员 ${admin.email} 创建激活码`);

    // 生成激活码
    const codes = [
      'TEST2024A',
      'TEST2024B',
      'TEST2024C',
      'DEMO1234',
      'BETA5678'
    ];

    const batchId = crypto.randomUUID();

    for (const code of codes) {
      try {
        await prisma.activationCode.create({
          data: {
            code: code,
            batchId: batchId,
            batchNote: '本地测试激活码',
            durationDays: 30,
            status: 'unused',
            createdBy: creatorId,
          },
        });
        console.log(`✅ ${code} - 创建成功`);
      } catch (err) {
        console.log(`❌ ${code} - 创建失败: ${(err as Error).message}`);
      }
    }

    console.log('\n🎉 激活码创建完成！');
    console.log('\n使用方法：');
    console.log('1. 先注册账号: http://localhost:3000/register');
    console.log('2. 登录后访问: http://localhost:3000/activate');
    console.log('3. 输入激活码激活账号');

  } catch (error) {
    console.error('❌ 错误:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createActivationCodes();
