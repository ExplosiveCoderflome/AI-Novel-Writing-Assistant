import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  AUTO_DIRECTOR_EVENT_OPTIONS,
  type AutoDirectorChannelDraft,
  summarizeSelectedAutoDirectorEvents,
} from "./autoDirectorEventOptions";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

function AutoDirectorEventMultiSelect(props: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const { value, onChange } = props;
  const [open, setOpen] = useState(false);

  return (
    <div className="min-w-0 space-y-2">
      <button
        type="button"
        className="flex min-h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className={`min-w-0 ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{summarizeSelectedAutoDirectorEvents(value)}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{open ? "收起" : "展开"}</span>
      </button>
      {open ? (
        <div className="min-w-0 space-y-2 rounded-md border bg-background p-3">
          {AUTO_DIRECTOR_EVENT_OPTIONS.map((item) => {
            const checked = value.includes(item.code);
            return (
              <label key={item.code} className="flex min-w-0 items-start gap-3 rounded-md border p-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={checked}
                  onChange={(event) => {
                    if (event.target.checked) {
                      onChange([...value, item.code]);
                      return;
                    }
                    onChange(value.filter((code) => code !== item.code));
                  }}
                />
                <div className="min-w-0 space-y-1">
                  <div className={`${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText} text-sm font-medium`}>{item.label}</div>
                  <div className={`${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText} text-xs text-muted-foreground`}>{item.description}</div>
                </div>
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function AutoDirectorChannelSettingsCard(props: {
  channelDraft: AutoDirectorChannelDraft;
  onBaseUrlChange: (value: string) => void;
  onPatchChannelDraft: (
    channelType: "dingtalk" | "wecom" | "feishu",
    patch: Partial<AutoDirectorChannelDraft["dingtalk"] & AutoDirectorChannelDraft["feishu"]>,
  ) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const {
    channelDraft,
    onBaseUrlChange,
    onPatchChannelDraft,
    onSave,
    isSaving,
  } = props;
  const toggleLabel = isOpen ? "收起导演跟进通道配置" : "展开导演跟进通道配置";

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 space-y-1.5">
          <CardTitle>导演跟进通道配置</CardTitle>
          <CardDescription className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>
            通过钉钉、企业微信或飞书接收创作提醒，并继续或重试任务。飞书长连接适用于桌面端，无需公网回调地址。
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label={toggleLabel}
          title={toggleLabel}
          aria-expanded={isOpen}
          aria-controls="auto-director-channel-settings-content"
          onClick={() => setIsOpen((prev) => !prev)}
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", isOpen ? "rotate-180" : "")} />
        </Button>
      </CardHeader>
      {isOpen ? (
        <CardContent id="auto-director-channel-settings-content" className="space-y-6">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">站内访问地址</div>
            <Input
              value={channelDraft.baseUrl}
              placeholder="https://book.example.com"
              onChange={(event) => onBaseUrlChange(event.target.value)}
            />
            <div className={`${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText} text-xs text-muted-foreground`}>
              用于钉钉/企微消息里的“打开跟进中心 / 查看详情”链接。未填写时会回退到服务端环境中的站点地址。
            </div>
          </div>

          {(["dingtalk", "wecom"] as const).map((channelType) => (
            <div key={channelType} className="min-w-0 space-y-3 border-t pt-4">
              <div className="font-medium">{channelType === "dingtalk" ? "钉钉" : "企业微信"}</div>
              {channelType === "dingtalk" ? (
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">加签密钥 Secret（可选）</div>
                  <Input type="password" value={channelDraft.dingtalk.secret} placeholder="机器人安全设置中的 SEC… 密钥"
                    onChange={(event) => onPatchChannelDraft("dingtalk", {secret: event.target.value})} />
                </div>
              ) : null}
              <div className="grid min-w-0 gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Webhook URL</div>
                  <Input
                    value={channelDraft[channelType].webhookUrl}
                    placeholder="https://..."
                    onChange={(event) => onPatchChannelDraft(channelType, { webhookUrl: event.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">回调 Token</div>
                  <Input
                    value={channelDraft[channelType].callbackToken}
                    placeholder="可选；未配置则只保留站内跳转"
                    onChange={(event) => onPatchChannelDraft(channelType, { callbackToken: event.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">用户映射 JSON</div>
                <Input
                  value={channelDraft[channelType].operatorMapJson}
                  placeholder='{"ding_user_1":"user_1"}'
                  onChange={(event) => onPatchChannelDraft(channelType, { operatorMapJson: event.target.value })}
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">订阅事件</div>
                <AutoDirectorEventMultiSelect
                  value={channelDraft[channelType].eventTypes}
                  onChange={(eventTypes) => onPatchChannelDraft(channelType, { eventTypes })}
                />
              </div>
            </div>
          ))}

          <div className="min-w-0 space-y-3 border-t pt-4">
            <div className="font-medium">飞书 / Lark 长连接</div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={channelDraft.feishu.enabled}
                onChange={(event) => onPatchChannelDraft("feishu", {enabled: event.target.checked})} />启用飞书通知与卡片操作
            </label>
            <p className="text-xs text-muted-foreground">创建企业自建应用，开启机器人和发送消息权限；在“事件与回调”的回调配置中选择长连接，并订阅 card.action.trigger。将机器人加入接收群。</p>
            <div className="grid min-w-0 gap-3 md:grid-cols-2">
              {([['appId', 'App ID'], ['appSecret', 'App Secret'], ['receiveId', '接收群或用户 ID'], ['operatorMapJson', '用户映射 JSON']] as const).map(([field, label]) => (
                <label key={field} className="space-y-1 text-xs text-muted-foreground">
                  <span>{label}</span>
                  <Input type={field === "appSecret" ? "password" : "text"} value={channelDraft.feishu[field]}
                    placeholder={field === "operatorMapJson" ? '{"ou_飞书用户ID":"站内用户ID"}' : label}
                    onChange={(event) => onPatchChannelDraft("feishu", {[field]: event.target.value})} />
                </label>
              ))}
              <label className="space-y-1 text-xs text-muted-foreground">
                <span>接收 ID 类型</span>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={channelDraft.feishu.receiveIdType}
                  onChange={(event) => onPatchChannelDraft("feishu", {receiveIdType: event.target.value as AutoDirectorChannelDraft["feishu"]["receiveIdType"]})}>
                  <option value="chat_id">群聊 chat_id</option><option value="open_id">用户 open_id</option><option value="user_id">用户 user_id</option>
                </select>
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                <span>服务区域</span>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={channelDraft.feishu.domain}
                  onChange={(event) => onPatchChannelDraft("feishu", {domain: event.target.value as "feishu" | "lark"})}>
                  <option value="feishu">飞书</option><option value="lark">Lark</option>
                </select>
              </label>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">订阅事件</div>
              <AutoDirectorEventMultiSelect value={channelDraft.feishu.eventTypes}
                onChange={(eventTypes) => onPatchChannelDraft("feishu", {eventTypes})} />
            </div>
          </div>

          <div className={AUTO_DIRECTOR_MOBILE_CLASSES.channelSettingsActionRow}>
            <Button variant="outline" asChild className={AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction}>
              <Link to="/settings/models">去看模型路由</Link>
            </Button>
            <Button className={AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction} onClick={onSave} disabled={isSaving}>
              {isSaving ? "保存中..." : "保存导演跟进通道配置"}
            </Button>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
