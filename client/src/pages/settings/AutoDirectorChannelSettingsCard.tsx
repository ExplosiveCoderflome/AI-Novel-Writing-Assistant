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
        <span className="shrink-0 text-xs text-muted-foreground">{open ? "Collapse" : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."}</span>
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
    channelType: "dingtalk" | "wecom",
    patch: Partial<AutoDirectorChannelDraft["dingtalk"]>,
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
  const toggleLabel = isOpen ? "Close director follow-up channel configuration" : "Expand director follow-up channel configuration";

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 space-y-1.5">
          <CardTitle>Director follow-up channel configuration</CardTitle>
          <CardDescription className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>
            Centrally configure webhooks, callback tokens, user mappings and event subscriptions for DingTalk and Qiwei. When the complete callback capability is not configured, the message will be automatically downgraded to only jump within the site.
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
            <div className="text-xs text-muted-foreground">Site access address</div>
            <Input
              value={channelDraft.baseUrl}
              placeholder="https://book.example.com"
              onChange={(event) => onBaseUrlChange(event.target.value)}
            />
            <div className={`${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText} text-xs text-muted-foreground`}>
              Used for the "Open Follow-up Center/View Details" link in DingTalk/Qiwei messages. If not filled in, it will fall back to the site address in the server environment.
                                      </div>
          </div>

          {(["dingtalk", "wecom"] as const).map((channelType) => (
            <div key={channelType} className="min-w-0 space-y-3 rounded-lg border p-3 sm:p-4">
              <div className="font-medium">{channelType === "dingtalk" ? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." : "Enterprise WeChat"}</div>
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
                  <div className="text-xs text-muted-foreground">Callback Token</div>
                  <Input
                    value={channelDraft[channelType].callbackToken}
                    placeholder="Optional; if not configured, only intra-site jumps will be retained."
                    onChange={(event) => onPatchChannelDraft(channelType, { callbackToken: event.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">User mapping JSON</div>
                <Input
                  value={channelDraft[channelType].operatorMapJson}
                  placeholder='{"ding_user_1":"user_1"}'
                  onChange={(event) => onPatchChannelDraft(channelType, { operatorMapJson: event.target.value })}
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Subscribe to events</div>
                <AutoDirectorEventMultiSelect
                  value={channelDraft[channelType].eventTypes}
                  onChange={(eventTypes) => onPatchChannelDraft(channelType, { eventTypes })}
                />
              </div>
            </div>
          ))}

          <div className={AUTO_DIRECTOR_MOBILE_CLASSES.channelSettingsActionRow}>
            <Button variant="outline" asChild className={AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction}>
              <Link to="/settings/model-routes">Go to model routing</Link>
            </Button>
            <Button className={AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction} onClick={onSave} disabled={isSaving}>
              {isSaving ? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." : "Save director follow-up channel configuration"}
            </Button>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
