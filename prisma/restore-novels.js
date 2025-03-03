const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // 获取当前数据库中的用户ID
    const users = await prisma.user.findMany();
    if (users.length === 0) {
        console.log('没有找到用户，无法恢复数据');
        return;
    }

    const userId = users[0].id;
    console.log(`将使用用户ID: ${userId} 恢复数据`);

    // 获取当前存在的角色信息
    const characters = await prisma.character.findMany();
    console.log(`找到 ${characters.length} 个角色`);

    // 从角色信息中提取小说ID
    const novelIds = [...new Set(characters.map(char => char.novelId))];
    console.log(`发现 ${novelIds.length} 个不同的小说ID`);

    // 收集每个小说的角色
    const novelCharacters = {};
    for (const novelId of novelIds) {
        novelCharacters[novelId] = characters.filter(char => char.novelId === novelId);
        console.log(`小说 ${novelId} 有 ${novelCharacters[novelId].length} 个角色`);
    }

    // 恢复小说数据
    console.log('\n开始恢复小说数据...');

    for (const novelId of novelIds) {
        // 检查小说是否已存在
        const existingNovel = await prisma.novel.findUnique({
            where: { id: novelId }
        });

        if (existingNovel) {
            console.log(`小说 ${novelId} 已存在，跳过创建`);
            continue;
        }

        // 基于角色信息推断小说标题和类型
        const chars = novelCharacters[novelId];
        let title = '恢复的小说';

        // 根据角色名字和背景推断小说标题
        if (chars.length > 0) {
            const mainChar = chars[0];
            const hasModernNames = chars.some(c => ['李思', '林默', '刘雪婷', '徐念尘', '林雨晴', '侯爽'].includes(c.name));

            const hasFantasyNames = chars.some(c => ['无垢', '驰哥', '周春晖-重生版'].includes(c.name));

            if (hasModernNames) {
                title = `${mainChar.name}的现代都市故事`;
            } else if (hasFantasyNames) {
                title = `${mainChar.name}的修仙之旅`;
            } else {
                title = `${mainChar.name}的冒险`;
            }
        }

        try {
            // 创建小说记录
            const novel = await prisma.novel.create({
                data: {
                    id: novelId,
                    title: title,
                    description: '这是一个恢复的小说，原始数据在数据库迁移中丢失',
                    authorId: userId,
                    status: 'draft',
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            });

            console.log(`成功恢复小说: ${novel.title} (ID: ${novel.id})`);
        } catch (e) {
            console.error(`恢复小说 ${novelId} 失败:`, e);
        }
    }
}

main()
    .catch(e => {
        console.error('恢复错误:', e);
        process.exit(1);
    })
    .finally(async() => {
        await prisma.$disconnect();
    });