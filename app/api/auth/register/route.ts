import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { hash } from 'bcryptjs';
import { z } from 'zod';

// 验证注册请求数据的 schema
const registerSchema = z.object({
  username: z.string().min(2, '用户名至少需要2个字符').max(50, '用户名最多50个字符'),
  email: z.string().email('请输入有效的邮箱地址'),
  password: z.string().min(6, '密码至少需要6个字符'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // 验证请求数据
    const result = registerSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { message: '输入数据无效', errors: result.error.errors },
        { status: 400 }
      );
    }

    const { username, email, password } = result.data;

    // 检查邮箱是否已被注册
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { message: '该邮箱已被注册' },
        { status: 400 }
      );
    }

    // 对密码进行加密
    const hashedPassword = await hash(password, 12);

    // 创建新用户
    const user = await prisma.user.create({
      data: {
        name: username,
        email,
        password: hashedPassword,
        role: 'user',
      },
    });

    // 移除密码后返回用户信息
    const { password: _, ...userWithoutPassword } = user;

    return NextResponse.json(
      { message: '注册成功', user: userWithoutPassword },
      { status: 201 }
    );
  } catch (error) {
    console.error('注册失败:', error);
    return NextResponse.json(
      { message: '注册失败，请稍后重试' },
      { status: 500 }
    );
  }
} 