'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Separator } from '../../components/ui/separator';
import PropertyLibrary from '../../components/v2/PropertyLibrary';
import { WorldPropertyLibraryItem } from '../../types/worldV2';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function PropertyLibraryPage() {
  return (
    <div className="container py-8 max-w-7xl mx-auto">
      <div className="flex items-center mb-6">
        <Link href="/worlds" className="mr-2">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">世界属性库</h1>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>已保存的世界属性</CardTitle>
          <CardDescription>
            这些属性可以在创建新世界时重复使用，帮助您快速构建新的小说世界。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PropertyLibrary showAddButton={false} />
        </CardContent>
      </Card>
      
      <Separator className="my-8" />
      
      <div className="text-center">
        <h3 className="text-lg font-medium mb-4">如何使用世界属性库</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">1. 保存属性</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                在世界生成器中创建属性时，点击书签图标将属性保存到库中。
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. 浏览属性</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                在世界生成器的"属性库"标签中浏览和搜索已保存的属性。
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-base">3. 重复使用</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                点击"添加"按钮将库中的属性添加到当前世界创建中。
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
} 