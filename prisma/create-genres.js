const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        // 创建父级流派
        const fantasyGenre = await prisma.novelGenre.create({
            data: {
                name: '奇幻',
                description: '包含魔法、异世界等元素的作品',
            }
        });

        const sciFiGenre = await prisma.novelGenre.create({
            data: {
                name: '科幻',
                description: '基于科学和技术发展的虚构作品',
            }
        });

        const romanceGenre = await prisma.novelGenre.create({
            data: {
                name: '爱情',
                description: '以爱情为主题的作品',
            }
        });

        // 创建子流派
        const highFantasy = await prisma.novelGenre.create({
            data: {
                name: '高奇幻',
                description: '拥有复杂世界观和魔法系统的奇幻作品',
                parentId: fantasyGenre.id
            }
        });

        const urbanFantasy = await prisma.novelGenre.create({
            data: {
                name: '都市奇幻',
                description: '发生在现代都市中的奇幻作品',
                parentId: fantasyGenre.id
            }
        });

        const hardSciFi = await prisma.novelGenre.create({
            data: {
                name: '硬科幻',
                description: '强调科学准确性的科幻作品',
                parentId: sciFiGenre.id
            }
        });

        const softSciFi = await prisma.novelGenre.create({
            data: {
                name: '软科幻',
                description: '关注社会和人文的科幻作品',
                parentId: sciFiGenre.id
            }
        });

        console.log('流派数据创建成功');
    } catch (error) {
        console.error('创建流派数据失败:', error);
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