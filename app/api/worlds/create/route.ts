import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { z } from 'zod';
import { Prisma } from '@prisma/client';

// 验证 schema
const worldSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  genre: z.string().optional(),
  magicSystem: z.any().optional(),
  technology: z.any().optional(),
  races: z.any().optional(),
  religions: z.any().optional(),
  politics: z.any().optional(),
  geography: z.any().optional(),
  culture: z.any().optional(),
  history: z.any().optional(),
  conflicts: z.any().optional()
});

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await request.json();
    const result = worldSchema.safeParse(body);

    if (!result.success) {
      return new NextResponse("Invalid data", { status: 400 });
    }

    const { name, description, genre } = result.data;
    const userEmail = session.user.email;
    const userName = session.user.name || "用户";

    if (!name) {
      return new NextResponse("Name is required", { status: 400 });
    }

    // 确保用户存在
    let user = await prisma.user.findUnique({
      where: { email: userEmail }
    });

    // 如果用户不存在，则创建用户
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: userEmail,
          name: userName,
        }
      });
    }

    // 准备要保存的数据
    const worldData = {
      name,
      description,
      genre,
      magicSystem: body.magicSystem as Prisma.InputJsonValue,
      technology: body.technology as Prisma.InputJsonValue,
      races: body.races as Prisma.InputJsonValue,
      religions: body.religions as Prisma.InputJsonValue,
      politics: body.politics as Prisma.InputJsonValue,
      geography: body.geography as Prisma.InputJsonValue,
      culture: body.culture as Prisma.InputJsonValue,
      history: body.history as Prisma.InputJsonValue,
      conflicts: body.conflicts as Prisma.InputJsonValue,
      userId: userEmail
    };

    const world = await prisma.world.create({
      data: worldData,
    });

    return NextResponse.json({
      success: true,
      data: world
    });
  } catch (error) {
    console.error("[WORLDS_POST]", error instanceof Error ? error.message : "未知错误");
    return new NextResponse("Internal error", { status: 500 });
  }
} 