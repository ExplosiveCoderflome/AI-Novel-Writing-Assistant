import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AUTO_DIRECTOR_EVENT_OPTIONS,
  type AutoDirectorChannelDraft,
  summarizeSelectedAutoDirectorEvents,
} from "./autoDirectorEventOptions";

function AutoDirectorEventMultiSelect(props: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const { value, onChange } = props;
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="flex min-h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-left text-sm"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{summarizeSelectedAutoDirectorEvents(value)}</span>
        <span className="text-xs text-muted-foreground">{open ? "收起" : "展开"}</span>
      </button>
      {open ? (
        <div className="space-y-2 rounded-md border bg-background p-3">
          {AUTO_DIRECTOR_EVENT_OPTIONS.map((item) => {
            const checked = value.includes(item.code);
            return (
              <label key={item.code} className="flex items-start gap-3 rounded-md border p-3">
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
                <div className="space-y-1">
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="text-xs text-muted-foreground">{item.description}</div>
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
    channelType: "dingtalk" | "wecom",
    patch: Partial<AutoDirectorChannelDraft["dingtalk"]>,
  ) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  const {
    channelDraft,
    onBaseUrlChange,
    onPatchChannelDraft,
    onSave,
    isSaving,
  } = props;

  return (
    <Card>
      <CardHeader>
        <CardTitle>导演跟进通道配置</CardTitle>
        <CardDescription>
          集中配置钉钉与企微的 webhook、回调 token、用户映射和事件订阅。未配完整回调能力时，消息会自动降级成仅跳转站内。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">站内访问地址</div>
          <Input
            value={channelDraft.baseUrl}
            placeholder="https://book.example.com"
            onChange={(event) => onBaseUrlChange(event.target.value)}
          />
          <div className="text-xs text-muted-foreground">
            用于钉钉/企微消息里的“打开跟进中心 / 查看详情”链接。未填写时会回退到服务端环境中的站点地址。
          </div>
        </div>

        {(["dingtalk", "wecom"] as const).map((channelType) => (
          <div key={channelType} className="space-y-3 rounded-lg border p-4">
            <div className="font-medium">{channelType === "dingtalk" ? "钉钉" : "企业微信"}</div>
            <div className="grid gap-3 md:grid-cols-2">
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

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" asChild>
            <Link to="/settings/model-routes">去看模型路由</Link>
          </Button>
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? "保存中..." : "保存导演跟进通道配置"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
