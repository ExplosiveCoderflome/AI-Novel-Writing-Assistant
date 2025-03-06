import { NextRequest, NextResponse } from 'next/server';
import { SavePropertyToLibraryRequest, WorldPropertyLibraryItem } from '@/types/worldV2';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

// 获取所有保存的属性
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const worldType = url.searchParams.get('worldType');
    
    // 构建查询
    let properties;
    if (worldType) {
      properties = await prisma.$queryRawUnsafe(
        `SELECT * FROM world_property_library WHERE worldType = ? ORDER BY usageCount DESC`,
        worldType
      );
    } else {
      properties = await prisma.$queryRawUnsafe(
        `SELECT * FROM world_property_library ORDER BY usageCount DESC`
      );
    }
    
    // 将查询结果转换为 API 响应格式
    const propertyItems: WorldPropertyLibraryItem[] = Array.isArray(properties) 
      ? properties.map((p: any) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          category: p.category,
          worldType: p.worldType,
          usageCount: p.usageCount,
          createdAt: new Date(p.createdAt).toISOString(),
          updatedAt: new Date(p.updatedAt).toISOString()
        }))
      : [];
    
    return NextResponse.json({
      success: true,
      data: propertyItems
    });
  } catch (error) {
    console.error('获取属性库失败:', error);
    return NextResponse.json({
      success: false,
      error: '获取属性库失败'
    }, { status: 500 });
  }
}

// 保存属性到库
export async function POST(req: NextRequest) {
  try {
    const { property, worldType } = await req.json() as SavePropertyToLibraryRequest;
    
    if (!property || !property.name || !property.description) {
      return NextResponse.json({
        success: false,
        error: '缺少必要参数'
      }, { status: 400 });
    }
    
    if (!worldType) {
      return NextResponse.json({
        success: false,
        error: '缺少世界类型'
      }, { status: 400 });
    }
    
    // 保存到数据库
    const now = new Date().toISOString();
    await prisma.$executeRawUnsafe(
      `INSERT INTO world_property_library (id, name, description, category, worldType, usageCount, createdAt, updatedAt) 
       VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, 0, ?, ?)`,
      property.name, 
      property.description, 
      property.category || 'general', 
      worldType,
      now,
      now
    );
    
    // 获取刚插入的记录
    const libraryItems = await prisma.$queryRawUnsafe(
      `SELECT * FROM world_property_library ORDER BY createdAt DESC LIMIT 1`
    );
    
    const libraryItem = Array.isArray(libraryItems) && libraryItems.length > 0 
      ? libraryItems[0] as any
      : null;
    
    if (!libraryItem) {
      throw new Error('保存后无法检索属性');
    }
    
    return NextResponse.json({
      success: true,
      data: {
        id: libraryItem.id,
        name: libraryItem.name,
        description: libraryItem.description,
        category: libraryItem.category,
        worldType: libraryItem.worldType,
        usageCount: libraryItem.usageCount,
        createdAt: new Date(libraryItem.createdAt).toISOString(),
        updatedAt: new Date(libraryItem.updatedAt).toISOString()
      }
    });
  } catch (error) {
    console.error('保存属性到库失败:', error);
    return NextResponse.json({
      success: false,
      error: '保存属性到库失败'
    }, { status: 500 });
  }
}

// 增加属性使用次数
export async function PUT(req: NextRequest) {
  try {
    const { id } = await req.json();
    
    if (!id) {
      return NextResponse.json({
        success: false,
        error: '缺少属性ID'
      }, { status: 400 });
    }
    
    // 获取当前属性
    const properties = await prisma.$queryRawUnsafe(
      `SELECT * FROM world_property_library WHERE id = ?`,
      id
    );
    
    const property = Array.isArray(properties) && properties.length > 0 
      ? properties[0] as any
      : null;
    
    if (!property) {
      return NextResponse.json({
        success: false,
        error: '属性不存在'
      }, { status: 404 });
    }
    
    // 更新使用次数
    const now = new Date().toISOString();
    await prisma.$executeRawUnsafe(
      `UPDATE world_property_library SET usageCount = usageCount + 1, updatedAt = ? WHERE id = ?`,
      now,
      id
    );
    
    // 重新获取更新后的记录
    const updatedProperties = await prisma.$queryRawUnsafe(
      `SELECT * FROM world_property_library WHERE id = ?`,
      id
    );
    
    const updatedProperty = Array.isArray(updatedProperties) && updatedProperties.length > 0 
      ? updatedProperties[0] as any
      : null;
    
    if (!updatedProperty) {
      throw new Error('更新后无法检索属性');
    }
    
    return NextResponse.json({
      success: true,
      data: {
        id: updatedProperty.id,
        name: updatedProperty.name,
        description: updatedProperty.description, 
        category: updatedProperty.category,
        worldType: updatedProperty.worldType,
        usageCount: updatedProperty.usageCount,
        createdAt: new Date(updatedProperty.createdAt).toISOString(),
        updatedAt: new Date(updatedProperty.updatedAt).toISOString()
      }
    });
  } catch (error) {
    console.error('更新属性使用次数失败:', error);
    return NextResponse.json({
      success: false,
      error: '更新属性使用次数失败'
    }, { status: 500 });
  }
} 