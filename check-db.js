// 检查数据库中是否存在写作公式表
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  try {
    // 尝试查询写作公式表
    const result = await prisma.$queryRaw`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='writing_formulas';
    `;
    
    if (result.length > 0) {
      console.log('写作公式表存在');
      
      // 尝试查询表结构
      const columns = await prisma.$queryRaw`
        PRAGMA table_info(writing_formulas);
      `;
      
      console.log('表结构:');
      columns.forEach(column => {
        console.log(`- ${column.name} (${column.type})`);
      });
      
      // 尝试查询记录数
      const count = await prisma.$queryRaw`
        SELECT COUNT(*) as count FROM writing_formulas;
      `;
      
      console.log(`记录数: ${count[0].count}`);
    } else {
      console.log('写作公式表不存在');
    }
  } catch (error) {
    console.error('查询失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main(); 