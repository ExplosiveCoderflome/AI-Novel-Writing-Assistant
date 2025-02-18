/*
 * @LastEditors: biz
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { Novel } from './types';

export async function GET() {
  try {
    const novels = await prisma.novel.findMany({
      orderBy: {
        updatedAt: 'desc'
      }
    });
    return NextResponse.json(novels);
  } catch (error) {
    console.error('Failed to fetch novels:', error);
    return NextResponse.json(
      { error: 'Failed to fetch novels' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const novelData = await request.json();
    console.log('Creating novel with data:', novelData);

    // 确保必要字段存在
    if (!novelData.title || !novelData.description || !novelData.genre) {
      console.error('Missing required fields:', {
        title: !novelData.title,
        description: !novelData.description,
        genre: !novelData.genre,
      });
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const novel = await prisma.novel.create({
      data: {
        title: novelData.title,
        description: novelData.description,
        genre: novelData.genre,
        authorId: 'user-1', // 临时固定值
        status: 'draft',
      },
    });

    console.log('Novel created successfully:', novel);
    return NextResponse.json(novel);
  } catch (error) {
    console.error('Failed to create novel:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create novel',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const novelData = await request.json();
    const { id, ...updateData } = novelData;
    
    const novel = await prisma.novel.update({
      where: { id },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
    });
    return NextResponse.json(novel);
  } catch (error) {
    console.error('Failed to update novel:', error);
    return NextResponse.json(
      { error: 'Failed to update novel' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    
    // 首先删除关联的章节
    await prisma.chapter.deleteMany({
      where: { novelId: id },
    });
    
    // 然后删除小说
    const novel = await prisma.novel.delete({
      where: { id },
    });
    
    return NextResponse.json(novel);
  } catch (error) {
    console.error('Failed to delete novel:', error);
    return NextResponse.json(
      { error: 'Failed to delete novel' },
      { status: 500 }
    );
  }
}