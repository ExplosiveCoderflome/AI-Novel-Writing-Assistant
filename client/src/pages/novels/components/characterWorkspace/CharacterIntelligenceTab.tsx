import type { Character } from "@ai-novel/shared/types/novel";
import { Badge } from "@/components/ui/badge";

interface CharacterIntelligenceTabProps {
  selectedCharacter: Character;
}

export default function CharacterIntelligenceTab(props: CharacterIntelligenceTabProps) {
  const { selectedCharacter } = props;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border/70 bg-muted/10 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-medium">智能层预留</div>
          <Badge variant="outline">规划中</Badge>
        </div>
        <div className="mt-1 text-xs leading-5 text-muted-foreground">
          这里用于承载角色思路线、角色对话和影响记录。相关内容进入正史前需要由你确认。
        </div>
      </section>

      <div className="grid gap-3 xl:grid-cols-3">
        <FuturePanel
          title="思路线"
          description={`观察“${selectedCharacter.name}”正在怀疑什么、误判什么、准备隐瞒什么。`}
          status="等待接入"
        />
        <FuturePanel
          title="角色对话"
          description="与角色沟通以理解其动机，重要信息可沉淀为可审阅的影响记录。"
          status="等待接入"
        />
        <FuturePanel
          title="影响记录"
          description="记录对话、推演和章节事件对角色态度、资源与关系的影响。"
          status="等待接入"
        />
      </div>
    </div>
  );
}

function FuturePanel(props: { title: string; description: string; status: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-background p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">{props.title}</div>
        <Badge variant="outline">{props.status}</Badge>
      </div>
      <div className="mt-2 text-xs leading-5 text-muted-foreground">{props.description}</div>
    </div>
  );
}
