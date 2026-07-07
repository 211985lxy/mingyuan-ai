import { PrismaClient } from './src/generated/prisma/client.js';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import crypto from 'crypto';

function createPrismaClient() {
  const url = new URL(
    (process.env.DATABASE_URL ?? "mysql://mingyuan:changethis@127.0.0.1:3306/mingyuan").replace(/^mysql:\/\//, "mariadb://")
  )

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
    // 首先创建或获取一个 AdminUser 作为真正的创建者（满足外键约束）
    const adminEmail = 'admin@mingyuan.ai';
    let admin = await prisma.adminUser.findUnique({ where: { email: adminEmail } });
    if (!admin) {
      admin = await prisma.adminUser.create({
        data: {
          email: adminEmail,
          password: 'skip-password-check',
          name: 'System Admin',
          role: 'admin',
        }
      });
      console.log(`✓ 自动生成系统管理员: ${adminEmail}`);
    }

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
