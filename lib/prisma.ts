/*
 * @LastEditors: biz
 */
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// 初始化检查
export async function checkDatabaseConnection() {
  try {
    await prisma.$connect();
    // 测试查询
    await prisma.aPIKey.count();
    return true;
  } catch (error) {
    console.error('数据库连接失败:', error);
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

// 确保数据库表已创建
export async function ensureDatabase() {
  try {
    const result = await checkDatabaseConnection();
    if (!result) {
      throw new Error('数据库连接失败');
    }
    return true;
  } catch (error) {
    console.error('数据库初始化失败:', error);
    return false;
  }
} 