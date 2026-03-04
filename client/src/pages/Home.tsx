import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>AI 小说写作助手</CardTitle>
        <CardDescription>项目已进入功能开发阶段，可从左侧导航进入各模块。</CardDescription>
      </CardHeader>
      <CardContent>建议先进入“小说列表”创建项目，再在编辑页生成发展走向与章节内容。</CardContent>
    </Card>
  );
}
