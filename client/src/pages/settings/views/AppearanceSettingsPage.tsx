import { Palette, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsShell } from "../components/SettingsShell";
import { useTheme } from "@/components/theme/ThemeProvider";

const palettes = [
  { value: "ink", label: "墨砚", description: "克制的蓝灰色，适合日常创作。" },
  { value: "paper", label: "暖纸", description: "柔和的米白色，适合阅读和章节编辑。" },
  { value: "night", label: "夜航", description: "深靛蓝与青绿色，适合 AI 执行和日志查看。" },
] as const;

export default function AppearanceSettingsPage() {
  const { mode, palette, density, setMode, setPalette, setDensity, reset } = useTheme();
  return (
    <SettingsShell title="外观与主题" description="选择适合长时间创作的界面颜色和显示密度。">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Palette className="h-4 w-4" />界面外观</CardTitle>
          <CardDescription>主题只保存在当前设备，不会影响小说内容和任务状态。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <label className="block space-y-2 text-sm font-medium">
            <span>显示模式</span>
            <Select value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="system">跟随系统</SelectItem>
                <SelectItem value="light">浅色</SelectItem>
                <SelectItem value="dark">深色</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>主题风格</span>
            <Select value={palette} onValueChange={(value) => setPalette(value as typeof palette)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {palettes.map((item) => <SelectItem key={item.value} value={item.value}>{item.label} · {item.description}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>界面密度</span>
            <Select value={density} onValueChange={(value) => setDensity(value as typeof density)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="comfortable">舒适</SelectItem>
                <SelectItem value="compact">紧凑</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={reset}><RotateCcw className="mr-2 h-4 w-4" />恢复默认主题</Button>
          </div>
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
