// 检查Prisma模型
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// 获取所有模型名称
const modelNames = Object.keys(prisma).filter(key => 
  !key.startsWith('_') && 
  !['$on', '$connect', '$disconnect', '$use', '$executeRaw', '$executeRawUnsafe', '$queryRaw', '$queryRawUnsafe', '$transaction'].includes(key)
);

console.log('Prisma模型列表:');
modelNames.forEach(name => {
  console.log(`- ${name}`);
});

// 关闭Prisma客户端连接
prisma.$disconnect(); 