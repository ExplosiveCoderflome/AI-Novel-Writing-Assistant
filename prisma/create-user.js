const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const user = await prisma.user.create({
            data: {
                id: '6f87de7e-26eb-4754-ada2-3addf7faf5e9', // 使用与check-user.js中相同的ID
                name: '默认用户',
                email: 'default@example.com',
                password: 'password123',
                role: 'admin'
            }
        });

        console.log('创建用户成功:', user);
    } catch (error) {
        if (error.code === 'P2002') {
            console.log('用户已存在，无需创建');
        } else {
            console.error('创建用户失败:', error);
        }
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