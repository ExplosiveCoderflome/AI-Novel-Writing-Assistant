/*
 * @LastEditors: biz
 */
import { PrismaClient } from '@prisma/client';

// PrismaClient 是一个重量级对象，应该在应用程序生命周期内重用
// 见: https://www.prisma.io/docs/guides/performance-and-optimization/connection-management

// 使用全局变量防止热重载导致的连接过多问题
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

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