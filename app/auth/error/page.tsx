'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '../../components/ui/button';
import Link from 'next/link';

const errors = {
  Signin: "尝试登录时出错",
  OAuthSignin: "尝试使用第三方登录时出错",
  OAuthCallback: "从第三方登录返回时出错",
  OAuthCreateAccount: "创建第三方登录账号时出错",
  EmailCreateAccount: "创建邮箱账号时出错",
  Callback: "回调处理时出错",
  OAuthAccountNotLinked: "此邮箱已经使用其他方式登录，请使用原来的登录方式",
  EmailSignin: "检查您的邮箱中的登录链接",
  CredentialsSignin: "登录失败，请检查您的邮箱和密码是否正确",
  SessionRequired: "请先登录后再访问此页面",
  default: "发生未知错误",
};

// 错误内容组件
function ErrorContent() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const errorType = searchParams?.get('error') || 'default';
    setError(errors[errorType as keyof typeof errors] || errors.default);
  }, [searchParams]);

  return (
    <div className="w-full max-w-md space-y-8 p-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-red-600">认证错误</h1>
        <p className="text-sm text-muted-foreground mt-2">{error}</p>
      </div>

      <div className="flex justify-center space-x-4">
        <Button asChild variant="outline">
          <Link href="/auth/login">返回登录</Link>
        </Button>
        <Button asChild>
          <Link href="/">返回首页</Link>
        </Button>
      </div>
    </div>
  );
}

// 主页面组件
export default function ErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Suspense fallback={
        <div className="w-full max-w-md space-y-8 p-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600">认证错误</h1>
            <p className="text-sm text-muted-foreground mt-2">加载中...</p>
          </div>
        </div>
      }>
        <ErrorContent />
      </Suspense>
    </div>
  );
} 