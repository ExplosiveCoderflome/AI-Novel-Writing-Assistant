/*
 * @LastEditors: biz
 */
import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const body = await req.json();
    const { 
      name, 
      description, 
      geography,
      culture,
      magicSystem,
      technology,
      history,
      conflicts,
      races,
      religions
    } = body;

    const world = await prisma.world.create({
      data: {
        userId: session.user.email,
        name,
        description,
        geography: geography || null,
        cultures: culture || null,
        magicSystem: magicSystem || null,
        technology: technology || null,
        background: history || null,
        conflicts: conflicts || null,
        races: races || null,
        religions: religions || null
      }
    });

    return NextResponse.json(world);
  } catch (error) {
    console.error('[WORLDS_POST]', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const worlds = await prisma.world.findMany({
      where: {
        userId: session.user.email
      }
    });

    // 将 JSON 字段正确处理，避免重复解析
    const parsedWorlds = worlds.map(world => {
      // 辅助函数，处理可能是字符串或已经是对象的字段
      const safeParseJson = (value, defaultValue) => {
        if (!value) return defaultValue;
        if (typeof value === 'string') {
          try {
            return JSON.parse(value);
          } catch (e) {
            console.error('JSON解析失败:', e);
            return defaultValue;
          }
        }
        return value; // 已经是对象，直接返回
      };

      // 默认值
      const defaultGeography = {
        terrain: [],
        climate: [],
        locations: []
      };
      
      const defaultCulture = {
        societies: [],
        customs: [],
        religions: [],
        politics: []
      };

      // 处理魔法系统
      const processMagicSystem = (value) => {
        const parsed = safeParseJson(value, {});
        return {
          rules: parsed.rules || [],
          elements: parsed.elements || [],
          practitioners: parsed.practitioners || [],
          limitations: parsed.limitations || []
        };
      };

      // 处理技术
      const processTechnology = (value) => {
        const parsed = safeParseJson(value, {});
        return {
          level: parsed.level || '',
          innovations: parsed.innovations || [],
          impact: parsed.impact || []
        };
      };

      return {
        ...world,
        geography: safeParseJson(world.geography, defaultGeography),
        culture: safeParseJson(world.cultures, defaultCulture),
        magicSystem: world.magicSystem ? processMagicSystem(world.magicSystem) : null,
        technology: world.technology ? processTechnology(world.technology) : null,
        history: safeParseJson(world.background, []),
        conflicts: safeParseJson(world.conflicts, []),
        races: safeParseJson(world.races, []),
        religions: safeParseJson(world.religions, [])
      };
    });

    return NextResponse.json(parsedWorlds);
  } catch (error) {
    console.error('[WORLDS_GET]', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
} 