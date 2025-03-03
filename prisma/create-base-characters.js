const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        // 创建基础角色模板
        await prisma.baseCharacter.create({
            data: {
                name: '勇敢的冒险者',
                role: '主角',
                personality: '勇敢、正直、富有同情心',
                background: '来自普通家庭，在一次意外中发现自己拥有特殊能力',
                development: '通过冒险逐渐掌握自己的能力，成长为真正的英雄',
                appearance: '身材匀称，眼神坚定，总是穿着便于行动的服装',
                weaknesses: '有时过于信任他人，容易陷入危险',
                interests: '探索未知、学习新技能、帮助弱小',
                keyEvents: '家乡被袭击、首次发现特殊能力、与反派的第一次遭遇',
                tags: '英雄,冒险者,勇者',
                category: '主角'
            }
        });

        await prisma.baseCharacter.create({
            data: {
                name: '神秘智者',
                role: '导师',
                personality: '睿智、神秘、有时古怪',
                background: '年轻时曾是伟大的冒险家，现在隐居传授知识',
                development: '从不愿参与到重新拿起武器保护新一代',
                appearance: '须发皆白，目光深邃，常穿宽松长袍',
                weaknesses: '固执己见，有时过于神秘导致误解',
                interests: '研究古籍、炼金术、星象',
                keyEvents: '与黑暗势力的旧日对抗、首次教导主角、重大牺牲',
                tags: '导师,智者,魔法师',
                category: '支持角色'
            }
        });

        await prisma.baseCharacter.create({
            data: {
                name: '野心家',
                role: '反派',
                personality: '狡猾、有野心、缺乏同情心',
                background: '出身高贵但遭到背叛，决心不惜一切代价夺回应得的一切',
                development: '从隐藏身份到公开与主角对抗',
                appearance: '气质高贵，眼神锐利，着装考究',
                weaknesses: '过度自信，低估对手，过分依赖力量',
                interests: '收集稀有物品、研究禁忌魔法、操控他人',
                keyEvents: '失去地位、发现力量源泉、与主角的宿命对决',
                tags: '反派,野心家,操控者',
                category: '反派'
            }
        });

        await prisma.baseCharacter.create({
            data: {
                name: '忠诚伙伴',
                role: '配角',
                personality: '忠诚、幽默、实用主义',
                background: '与主角有共同的成长经历，或在关键时刻被主角所救',
                development: '从依赖主角到成为独当一面的战友',
                appearance: '朴实无华，表情生动，装备实用',
                weaknesses: '有时缺乏自信，过度保护主角',
                interests: '锻造武器、讲述故事、寻找宝藏',
                keyEvents: '与主角的相遇、第一次救主角于危难、独立完成任务的自我证明',
                tags: '伙伴,战友,朋友',
                category: '支持角色'
            }
        });

        console.log('基础角色数据创建成功');
    } catch (error) {
        console.error('创建基础角色数据失败:', error);
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