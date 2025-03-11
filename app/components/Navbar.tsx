'use client';

import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { Button } from './ui/button';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from './ui/navigation-menu';
import { 
  BookOpen, 
  PenTool, 
  BookType, 
  Settings, 
  LogOut,
  User,
  BookMarked,
  BookPlus,
  BookTemplate,
  Compass,
  Shield,
  Key,
  Globe2,
  MessageSquare,
  FileText,
  Sparkles
} from 'lucide-react';

export function Navbar() {
  const router = useRouter();
  const { data: session, status } = useSession();

  // 如果正在加载会话状态，显示加载中的导航栏
  if (status === 'loading') {
    return (
      <div className="border-b">
        <div className="flex h-16 items-center px-4 container mx-auto">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl">
            <BookOpen className="h-6 w-6" />
            <span>小说创作平台</span>
          </Link>
          <div className="ml-auto">
            <div className="h-8 w-24 bg-gray-200 animate-pulse rounded" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="border-b">
        <div className="flex h-16 items-center px-4 container mx-auto">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl">
            <BookOpen className="h-6 w-6" />
            <span>小说创作平台</span>
          </Link>

          <NavigationMenu className="mx-6">
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger>创作中心</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <div className="grid gap-3 p-4 w-[400px]">
                    <Link 
                      href="/novels" 
                      className="flex items-center gap-2 p-2 hover:bg-accent rounded-md"
                    >
                      <BookMarked className="h-5 w-5" />
                      <div>
                        <div className="font-medium">我的作品</div>
                        <p className="text-sm text-muted-foreground">
                          管理你的所有小说作品
                        </p>
                      </div>
                    </Link>
                    <Link 
                      href="/worlds" 
                      className="flex items-center gap-2 p-2 hover:bg-accent rounded-md"
                    >
                      <Globe2 className="h-5 w-5" />
                      <div>
                        <div className="font-medium">世界管理</div>
                        <p className="text-sm text-muted-foreground">
                          创建和管理小说世界设定
                        </p>
                      </div>
                    </Link>
                    <Link 
                      href="/worlds/v2" 
                      className="flex items-center gap-2 p-2 hover:bg-accent rounded-md"
                    >
                      <Globe2 className="h-5 w-5" />
                      <div>
                        <div className="font-medium">世界生成器V2</div>
                        <p className="text-sm text-muted-foreground">
                          使用升级版AI助手生成世界设定
                        </p>
                      </div>
                    </Link>
                    <Link 
                      href="/novels/new" 
                      className="flex items-center gap-2 p-2 hover:bg-accent rounded-md"
                    >
                      <BookPlus className="h-5 w-5" />
                      <div>
                        <div className="font-medium">开始创作</div>
                        <p className="text-sm text-muted-foreground">
                          创建一部新的小说
                        </p>
                      </div>
                    </Link>
                    <Link 
                      href="/novels/drafts" 
                      className="flex items-center gap-2 p-2 hover:bg-accent rounded-md"
                    >
                      <PenTool className="h-5 w-5" />
                      <div>
                        <div className="font-medium">草稿箱</div>
                        <p className="text-sm text-muted-foreground">
                          查看未完成的作品
                        </p>
                      </div>
                    </Link>
                    <Link 
                      href="/novels/published" 
                      className="flex items-center gap-2 p-2 hover:bg-accent rounded-md"
                    >
                      <BookTemplate className="h-5 w-5" />
                      <div>
                        <div className="font-medium">已发布</div>
                        <p className="text-sm text-muted-foreground">
                          管理已发布的作品
                        </p>
                      </div>
                    </Link>
                    <Link 
                      href="/base-characters" 
                      className="flex items-center gap-2 p-2 hover:bg-accent rounded-md"
                    >
                      <User className="h-5 w-5" />
                      <div>
                        <div className="font-medium">基础角色库</div>
                        <p className="text-sm text-muted-foreground">
                          管理和复用角色模板
                        </p>
                      </div>
                    </Link>
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>

              <NavigationMenuItem>
                <NavigationMenuTrigger>发现</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <div className="grid gap-3 p-4 w-[400px]">
                    <Link 
                      href="/explore" 
                      className="flex items-center gap-2 p-2 hover:bg-accent rounded-md"
                    >
                      <Compass className="h-5 w-5" />
                      <div>
                        <div className="font-medium">作品广场</div>
                        <p className="text-sm text-muted-foreground">
                          发现优秀的小说作品
                        </p>
                      </div>
                    </Link>
                    <Link 
                      href="/admin/genres" 
                      className="flex items-center gap-2 p-2 hover:bg-accent rounded-md"
                    >
                      <BookType className="h-5 w-5" />
                      <div>
                        <div className="font-medium">小说类型</div>
                        <p className="text-sm text-muted-foreground">
                          浏览不同类型的作品
                        </p>
                      </div>
                    </Link>
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>

              <NavigationMenuItem>
                <Link href="/chat" className="flex items-center gap-2 px-3 py-2 hover:bg-accent rounded-md">
                  <MessageSquare className="h-5 w-5" />
                  <span>AI 助手</span>
                </Link>
              </NavigationMenuItem>

              <NavigationMenuItem>
                <Link href="/content-publisher" className="flex items-center gap-2 px-3 py-2 hover:bg-accent rounded-md">
                  <FileText className="h-5 w-5" />
                  <span>内容发布助手</span>
                </Link>
              </NavigationMenuItem>

              <NavigationMenuItem>
                <Link href="/writing-formula" className="flex items-center gap-2 px-3 py-2 hover:bg-accent rounded-md">
                  <Sparkles className="h-5 w-5" />
                  <span>写作公式</span>
                </Link>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>

          <div className="ml-auto flex items-center gap-4">
            {session ? (
              <>
                <NavigationMenu>
                  <NavigationMenuList>
                    <NavigationMenuItem>
                      <NavigationMenuTrigger className="flex items-center gap-2">
                        <User className="h-5 w-5" />
                        <span>{session.user?.name || '用户'}</span>
                      </NavigationMenuTrigger>
                      <NavigationMenuContent>
                        <div className="grid w-[200px] gap-2 p-2">
                          <Link 
                            href="/settings/profile" 
                            className="flex items-center gap-2 p-2 hover:bg-accent rounded-md"
                          >
                            <User className="h-4 w-4" />
                            <span>个人资料</span>
                          </Link>
                          <Link 
                            href="/settings/account" 
                            className="flex items-center gap-2 p-2 hover:bg-accent rounded-md"
                          >
                            <Settings className="h-4 w-4" />
                            <span>账号设置</span>
                          </Link>
                          <Link 
                            href="/settings" 
                            className="flex items-center gap-2 p-2 hover:bg-accent rounded-md"
                          >
                            <Key className="h-4 w-4" />
                            <span>模型配置</span>
                          </Link>
                          <Link 
                            href="/admin/genres" 
                            className="flex items-center gap-2 p-2 hover:bg-accent rounded-md"
                          >
                            <Shield className="h-4 w-4" />
                            <span>类型管理</span>
                          </Link>
                          <button
                            onClick={() => signOut()}
                            className="flex items-center gap-2 p-2 hover:bg-accent rounded-md w-full text-left text-red-500"
                          >
                            <LogOut className="h-4 w-4" />
                            <span>退出登录</span>
                          </button>
                        </div>
                      </NavigationMenuContent>
                    </NavigationMenuItem>
                  </NavigationMenuList>
                </NavigationMenu>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => router.push('/auth/login')}>
                  登录
                </Button>
                <Button onClick={() => router.push('/auth/register')}>
                  注册
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
} 