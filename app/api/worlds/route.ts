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
        geography: geography ? JSON.stringify(geography) : null,
        cultures: culture ? JSON.stringify(culture) : null,
        magicSystem: magicSystem ? JSON.stringify(magicSystem) : null,
        technology: technology ? JSON.stringify(technology) : null,
        background: history ? JSON.stringify(history) : null,
        conflicts: conflicts ? JSON.stringify(conflicts) : null,
        races: races ? JSON.stringify(races) : null,
        religions: religions ? JSON.stringify(religions) : null
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

    // 将 JSON 字符串转换回对象
    const parsedWorlds = worlds.map(world => ({
      ...world,
      geography: world.geography ? JSON.parse(world.geography) : {
        terrain: [],
        climate: [],
        locations: []
      },
      culture: world.cultures ? JSON.parse(world.cultures) : {
        societies: [],
        customs: [],
        religions: [],
        politics: []
      },
      magicSystem: world.magicSystem ? (() => {
        const parsed = JSON.parse(world.magicSystem);
        return {
          rules: parsed.rules || [],
          elements: parsed.elements || [],
          practitioners: parsed.practitioners || [],
          limitations: parsed.limitations || []
        };
      })() : null,
      technology: world.technology ? (() => {
        const parsed = JSON.parse(world.technology);
        return {
          level: parsed.level || '',
          innovations: parsed.innovations || [],
          impact: parsed.impact || []
        };
      })() : null,
      history: world.background ? JSON.parse(world.background) : [],
      conflicts: world.conflicts ? JSON.parse(world.conflicts) : [],
      races: world.races ? JSON.parse(world.races) : [],
      religions: world.religions ? JSON.parse(world.religions) : []
    }));

    return NextResponse.json(parsedWorlds);
  } catch (error) {
    console.error('[WORLDS_GET]', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
} 