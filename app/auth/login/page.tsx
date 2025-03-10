'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { toast } from '../../components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';

// 登录表单组件
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        toast({
          title: '登录失败',
          description: result.error,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: '登录成功',
        description: '正在跳转...',
      });

      // 获取回调 URL 或默认跳转到首页
      const callbackUrl = searchParams.get('callbackUrl') || '/';
      router.push(callbackUrl);
      router.refresh();
    } catch (error) {
      console.error('登录失败:', error);
      toast({
        title: '登录失败',
        description: '请检查邮箱和密码是否正确',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-8 p-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold">登录</h1>
        <p className="text-sm text-muted-foreground mt-2">
          登录以继续使用小说创作平台
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="email">邮箱</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="请输入邮箱"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">密码</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入密码"
            required
          />
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              登录中...
            </>
          ) : (
            '登录'
          )}
        </Button>
      </form>

      <div className="text-center text-sm">
        <span className="text-muted-foreground">还没有账号？</span>{' '}
        <Link
          href="/auth/register"
          className="text-primary hover:underline font-medium"
        >
          立即注册
        </Link>
      </div>
    </div>
  );
}

// 主页面组件
export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Suspense fallback={
        <div className="w-full max-w-md space-y-8 p-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold">登录</h1>
            <p className="text-sm text-muted-foreground mt-2">加载中...</p>
          </div>
        </div>
      }>
        <LoginForm />
      </Suspense>
    </div>
  );
} 