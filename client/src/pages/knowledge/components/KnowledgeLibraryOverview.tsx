import type { LucideIcon } from "lucide-react";
import {
  BookOpenCheck,
  CircleAlert,
  Database,
  FileCheck2,
  Files,
  LoaderCircle,
  RefreshCw,
  SearchCheck,
  Upload,
} from "lucide-react";
import {
  AssetLibraryHeader,
  AssetLibraryRecommendation,
  AssetLibraryStatusGrid,
  type AssetLibraryTone,
} from "@/components/assetLibrary";
import OpenInCreativeHubButton from "@/components/creativeHub/OpenInCreativeHubButton";
import { Button } from "@/components/ui/button";

type RecommendationAction = "clear_filters" | "open_documents" | "open_ops" | "retry" | "upload";

interface RecommendationState {
  action: RecommendationAction;
  description: string;
  icon: LucideIcon;
  title: string;
  tone: AssetLibraryTone;
}

interface KnowledgeLibraryOverviewProps {
  activeJobCount: number;
  enabledCount: number;
  failedIndexDocumentCount: number;
  failedJobCount: number;
  hasFilters: boolean;
  isError: boolean;
  isLoading: boolean;
  searchableDocumentCount: number;
  selectedDocumentId?: string;
  visibleDocumentCount: number;
  onClearFilters: () => void;
  onOpenDocuments: () => void;
  onOpenOps: () => void;
  onRetry: () => void;
  onUpload: () => void;
}

function getRecommendation(props: KnowledgeLibraryOverviewProps): RecommendationState {
  if (props.isError) {
    return {
      action: "retry",
      description: "资料列表暂时无法读取。重新加载不会修改已有资料或索引任务。",
      icon: CircleAlert,
      title: "重新加载知识资料",
      tone: "danger",
    };
  }
  if (props.isLoading) {
    return {
      action: "open_documents",
      description: "正在整理资料状态与索引结果，加载完成后会给出可执行的下一步。",
      icon: LoaderCircle,
      title: "正在读取知识资料",
      tone: "neutral",
    };
  }
  if (props.activeJobCount > 0) {
    return {
      action: "open_ops",
      description: `${props.activeJobCount} 个索引任务正在执行，可查看进度；创作时优先选择已完成索引的资料。`,
      icon: RefreshCw,
      title: "查看资料同步进度",
      tone: "info",
    };
  }
  if (props.failedIndexDocumentCount > 0 || props.failedJobCount > 0) {
    return {
      action: "open_ops",
      description: "部分资料尚未完成索引。先查看失败原因并重建索引，其他可用资料仍可继续参与创作。",
      icon: CircleAlert,
      title: "处理未完成的资料索引",
      tone: "warning",
    };
  }
  if (props.visibleDocumentCount === 0 && props.hasFilters) {
    return {
      action: "clear_filters",
      description: "当前搜索或状态条件没有匹配结果，清除筛选即可返回完整资料列表。",
      icon: SearchCheck,
      title: "查看其他知识资料",
      tone: "neutral",
    };
  }
  if (props.visibleDocumentCount === 0) {
    return {
      action: "upload",
      description: "上传一份 TXT 资料，系统会建立索引，供拆书、规划和正文创作调用。",
      icon: Upload,
      title: "先添加一份创作资料",
      tone: "info",
    };
  }
  if (props.searchableDocumentCount === 0) {
    return {
      action: "open_documents",
      description: "列表中还没有已启用且完成索引的资料。选择一份资料启用或重建索引后即可用于创作。",
      icon: Database,
      title: "准备一份可检索资料",
      tone: "warning",
    };
  }
  return {
    action: "open_documents",
    description: `${props.searchableDocumentCount} 份资料可以参与检索。可查看版本、测试召回，或选择资料继续创作。`,
    icon: BookOpenCheck,
    title: "选择资料继续创作",
    tone: "success",
  };
}

export default function KnowledgeLibraryOverview(props: KnowledgeLibraryOverviewProps) {
  const recommendation = getRecommendation(props);
  const documentStatusUnavailable = props.isLoading || props.isError;

  const recommendationAction = (() => {
    switch (recommendation.action) {
      case "upload":
        return (
          <Button type="button" size="sm" onClick={props.onUpload}>
            <Upload className="h-4 w-4" />
            上传资料
          </Button>
        );
      case "retry":
        return (
          <Button type="button" size="sm" variant="outline" onClick={props.onRetry}>
            <RefreshCw className="h-4 w-4" />
            重新加载
          </Button>
        );
      case "clear_filters":
        return (
          <Button type="button" size="sm" variant="outline" onClick={props.onClearFilters}>
            清除筛选
          </Button>
        );
      case "open_ops":
        return (
          <Button type="button" size="sm" variant="outline" onClick={props.onOpenOps}>
            查看索引状态
          </Button>
        );
      default:
        if (props.isLoading) {
          return (
            <Button type="button" size="sm" variant="outline" disabled>
              正在加载
            </Button>
          );
        }
        return (
          <Button type="button" size="sm" variant="outline" onClick={props.onOpenDocuments}>
            查看资料
          </Button>
        );
    }
  })();

  return (
    <>
      <AssetLibraryHeader
        icon={Database}
        context="创作资产 · 知识与检索"
        title="知识资料库"
        description="集中管理可复用的创作资料，确认索引状态，再把可靠内容带入拆书、规划和正文创作。"
        actions={(
          <>
            <Button type="button" onClick={props.onUpload}>
              <Upload className="h-4 w-4" />
              上传资料
            </Button>
            <OpenInCreativeHubButton
              bindings={{ knowledgeDocumentIds: props.selectedDocumentId ? [props.selectedDocumentId] : [] }}
              label="发送到创作中枢"
            />
          </>
        )}
      />

      <AssetLibraryStatusGrid
        items={[
          {
            key: "documents",
            label: props.hasFilters ? "当前筛选结果" : "当前资料",
            value: documentStatusUnavailable ? "—" : props.visibleDocumentCount,
            detail: props.hasFilters ? "按当前搜索和状态条件统计" : "默认展示未归档资料",
            icon: Files,
          },
          {
            key: "enabled",
            label: "已启用",
            value: documentStatusUnavailable ? "—" : props.enabledCount,
            detail: "可被选择用于创作",
            icon: FileCheck2,
            tone: documentStatusUnavailable ? "neutral" : props.enabledCount > 0 ? "success" : "neutral",
          },
          {
            key: "searchable",
            label: "可检索",
            value: documentStatusUnavailable ? "—" : props.searchableDocumentCount,
            detail: "已启用且索引完成",
            icon: SearchCheck,
            tone: documentStatusUnavailable
              ? "neutral"
              : props.searchableDocumentCount > 0 ? "success" : "warning",
          },
          {
            key: "index-jobs",
            label: "正在同步",
            value: props.activeJobCount,
            detail: props.failedJobCount > 0
              ? `${props.failedJobCount} 份资料的最近索引失败`
              : "没有失败任务需要处理",
            icon: RefreshCw,
            tone: props.failedJobCount > 0 ? "danger" : props.activeJobCount > 0 ? "info" : "neutral",
          },
        ]}
      />

      <AssetLibraryRecommendation
        icon={recommendation.icon}
        title={recommendation.title}
        description={recommendation.description}
        tone={recommendation.tone}
        action={recommendationAction}
      />
    </>
  );
}
