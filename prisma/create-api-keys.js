const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        // 查找用户
        const userId = '6f87de7e-26eb-4754-ada2-3addf7faf5e9';
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user) {
            console.error('找不到用户，请先运行 create-user.js');
            return;
        }

        // 创建示例API Key
        await prisma.aPIKey.create({
            data: {
                provider: 'openai',
                key: 'sk-demo-key-openai-not-real',
                model: 'gpt-3.5-turbo',
                isActive: true,
                userId: userId
            }
        });

        await prisma.aPIKey.create({
            data: {
                provider: 'anthropic',
                key: 'sk-demo-key-anthropic-not-real',
                model: 'claude-3-opus',
                isActive: true,
                userId: userId
            }
        });

        console.log('API Key数据创建成功');
    } catch (error) {
        console.error('创建API Key数据失败:', error);
    }
}

main()
    .catch(e => {
        console.error('执行错误:', e);
        process.exit(1);
    })
    .finally(async() => {
        await prisma.$disconnect();
    });