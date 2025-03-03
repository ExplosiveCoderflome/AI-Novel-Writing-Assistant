/*
 * @LastEditors: biz
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const userId = '6f87de7e-26eb-4754-ada2-3addf7faf5e9';

    console.log('====== 查找用户信息 ======');
    const user = await prisma.user.findUnique({
        where: { id: userId }
    });
    console.log('用户信息:', user);

    console.log('\n====== 查找该用户的小说 ======');
    const novels = await prisma.novel.findMany({
        where: { authorId: userId }
    });
    console.log(`找到 ${novels.length} 个小说:`);
    novels.forEach((novel, index) => {
        console.log(`\n小说 ${index + 1}: ${novel.title}`);
        console.log(JSON.stringify(novel, null, 2));
    });

    if (novels.length > 0) {
        console.log('\n====== 查找小说的章节 ======');
        for (const novel of novels) {
            const chapters = await prisma.chapter.findMany({
                where: { novelId: novel.id },
                orderBy: { order: 'asc' }
            });
            console.log(`\n小说《${novel.title}》有 ${chapters.length} 个章节:`);
            chapters.forEach((chapter, index) => {
                console.log(`  章节 ${index + 1}: ${chapter.title}`);
            });
        }

        console.log('\n====== 查找小说的角色 ======');
        for (const novel of novels) {
            const characters = await prisma.character.findMany({
                where: { novelId: novel.id }
            });
            console.log(`\n小说《${novel.title}》有 ${characters.length} 个角色:`);
            characters.forEach((character, index) => {
                console.log(`  角色 ${index + 1}: ${character.name} (${character.role})`);
            });
        }
    }
}

main()
    .catch(e => {
        console.error('查询错误:', e);
        process.exit(1);
    })
    .finally(async() => {
        await prisma.$disconnect();
    });