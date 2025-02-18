'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HomeIcon, HeartIcon, RefreshCw, BookOpenCheck, Settings } from 'lucide-react';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "./ui/navigation-menu";

const Navigation = () => {
  const pathname = usePathname();

  const menuItems = [
    {
      href: '/',
      icon: <HomeIcon className="h-5 w-5" />,
      label: '首页',
    },
    {
      href: '/search',
      icon: <HomeIcon className="h-5 w-5" />,
      label: '搜索',
    },
    {
      href: '/crawler',
      icon: <RefreshCw className="h-5 w-5" />,
      label: '爬虫管理',
    },
    {
      href: '/favorites',
      icon: <HeartIcon className="h-5 w-5" />,
      label: '收藏',
    },
    {
      href: '/novels',
      icon: <BookOpenCheck className="h-5 w-5" />,
      label: '小说',
    },
    {
      href: '/settings',
      icon: <Settings className="h-5 w-5" />,
      label: '设置',
    },
  ];

  return (
    <div className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center justify-between">
        <div className="flex items-center">
          <div className="mr-4 hidden md:flex">
            <Link href="/" className="mr-6 flex items-center space-x-2">
              <span className="hidden font-bold sm:inline-block">
                Smart Search Assistant
              </span>
            </Link>
          </div>
          <NavigationMenu>
            <NavigationMenuList>
              {menuItems.map((item) => (
                <NavigationMenuItem key={item.href}>
                  <Link href={item.href} legacyBehavior passHref>
                    <NavigationMenuLink
                      className={navigationMenuTriggerStyle()}
                      active={pathname === item.href}
                    >
                      <div className="flex items-center gap-2">
                        {item.icon}
                        <span>{item.label}</span>
                      </div>
                    </NavigationMenuLink>
                  </Link>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/settings" className="flex items-center gap-2 px-4 py-2 text-sm">
            <Settings className="h-4 w-4" />
            <span>设置</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Navigation; 