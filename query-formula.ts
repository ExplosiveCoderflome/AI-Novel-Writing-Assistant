import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    // 查询指定ID的写作公式
    const formula = await prisma.writingFormula.findUnique({
      where: { id: 'cd80acdc-849d-480d-a616-b0bb8906efe0' }
    });
    
    console.log('查询结果:', formula);
    
    // 如果没有找到，查询所有写作公式
    if (!formula) {
      console.log('未找到指定ID的写作公式，查询所有写作公式:');
      const allFormulas = await prisma.writingFormula.findMany({
        select: {
          id: true,
          name: true,
          createdAt: true
        }
      });
      console.log('所有写作公式:', allFormulas);
    }
  } catch (error) {
    console.error('查询出错:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main(); 