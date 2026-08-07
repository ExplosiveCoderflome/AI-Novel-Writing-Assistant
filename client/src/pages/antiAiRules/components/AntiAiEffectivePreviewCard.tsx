import type { AntiAiEffectiveRulesResult, StyleProfile } from "@ai-novel/shared/types/styleEngine";
import { SlidersHorizontal } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import EffectiveRuleList from "./EffectiveRuleList";

interface AntiAiEffectivePreviewCardProps {
  profiles: StyleProfile[];
  styleProfileId: string;
  effective?: AntiAiEffectiveRulesResult;
  loading: boolean;
  onStyleProfileChange: (styleProfileId: string) => void;
}

export default function AntiAiEffectivePreviewCard(props: AntiAiEffectivePreviewCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <SlidersHorizontal className="h-5 w-5" />
          Effective preview
                          </CardTitle>
        <CardDescription>
          View the global rules that will be obtained when the text is generated, as well as the exclusive rules that are superimposed after selecting the writing method.
                          </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select
          value={props.styleProfileId || "__global__"}
          onValueChange={(value) => props.onStyleProfileChange(value === "__global__" ? "" : value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select preview context" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__global__">Only look at the global default</SelectItem>
            {props.profiles.map((profile) => (
              <SelectItem key={profile.id} value={profile.id}>{profile.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {props.loading ? (
          <div className="text-sm text-muted-foreground">Calculating effective rules...</div>
        ) : null}

        {props.effective ? (
          <div className="space-y-4">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-md border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Global baseline</div>
                <div className="mt-1 font-semibold">{props.effective.usesGlobalAntiAiBaseline ? "Applied" : "Not Applied"}</div>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Effective rules</div>
                <div className="mt-1 font-semibold">{props.effective.effectiveRules.length}</div>
              </div>
            </div>
            <EffectiveRuleList
              title="Global default rules"
              rules={props.effective.globalBaselineRules}
              empty="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
            />
            <EffectiveRuleList
              title="Special rules for writing"
              rules={props.effective.styleSpecificRules}
              empty="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
