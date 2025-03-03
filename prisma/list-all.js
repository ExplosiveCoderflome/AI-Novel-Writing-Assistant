const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('====== 所有用户 ======');
    const users = await prisma.user.findMany();
    console.log(`找到 ${users.length} 个用户:`);
    users.forEach((user, index) => {
        console.log(`用户 ${index + 1}: ID=${user.id}, 名称=${user.name}, 邮箱=${user.email}`);
    });

    console.log('\n====== 所有小说 ======');
    const novels = await prisma.novel.findMany();
    console.log(`找到 ${novels.length} 个小说:`);
    novels.forEach((novel, index) => {
        console.log(`小说 ${index + 1}: ID=${novel.id}, 标题=${novel.title}, 作者ID=${novel.authorId}`);
    });

    console.log('\n====== 所有角色 ======');
    const characters = await prisma.character.findMany();
    console.log(`找到 ${characters.length} 个角色:`);
    characters.forEach((character, index) => {
        console.log(`角色 ${index + 1}: ID=${character.id}, 名称=${character.name}, 所属小说ID=${character.novelId}`);
    });

    console.log('\n====== 所有章节 ======');
    const chapters = await prisma.chapter.findMany();
    console.log(`找到 ${chapters.length} 个章节:`);
    chapters.forEach((chapter, index) => {
        console.log(`章节 ${index + 1}: ID=${chapter.id}, 标题=${chapter.title}, 所属小说ID=${chapter.novelId}`);
    });

    console.log('\n====== 所有小说类型 ======');
    const genres = await prisma.novelGenre.findMany();
    console.log(`找到 ${genres.length} 个类型:`);
    genres.forEach((genre, index) => {
        console.log(`类型 ${index + 1}: ID=${genre.id}, 名称=${genre.name}`);
    });
}

main()
    .catch(e => {
        console.error('查询错误:', e);
        process.exit(1);
    })
    .finally(async() => {
        await prisma.$disconnect();
    });