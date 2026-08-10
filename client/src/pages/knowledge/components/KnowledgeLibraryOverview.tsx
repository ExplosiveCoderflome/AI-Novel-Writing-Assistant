import i18next from "i18next";
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
      description: i18next.t("knowledge.knowledgeLibraryOverview.l9ctnz"),
      icon: CircleAlert,
      title: i18next.t("knowledge.knowledgeLibraryOverview.2w960m"),
      tone: "danger",
    };
  }
  if (props.isLoading) {
    return {
      action: "open_documents",
      description: i18next.t("knowledge.knowledgeLibraryOverview.onm70p"),
      icon: LoaderCircle,
      title: i18next.t("knowledge.knowledgeLibraryOverview.zhivxy"),
      tone: "neutral",
    };
  }
  if (props.activeJobCount > 0) {
    return {
      action: "open_ops",
      description: `${props.activeJobCount} 个索引任务正在执行，可查看进度；创作时优先选择已完成索引的资料。`,
      icon: RefreshCw,
      title: i18next.t("knowledge.knowledgeLibraryOverview.qoti8x"),
      tone: "info",
    };
  }
  if (props.failedIndexDocumentCount > 0 || props.failedJobCount > 0) {
    return {
      action: "open_ops",
      description: i18next.t("knowledge.knowledgeLibraryOverview.mxsiya"),
      icon: CircleAlert,
      title: i18next.t("knowledge.knowledgeLibraryOverview.pncfds"),
      tone: "warning",
    };
  }
  if (props.visibleDocumentCount === 0 && props.hasFilters) {
    return {
      action: "clear_filters",
      description: i18next.t("knowledge.knowledgeLibraryOverview.6o6wkw"),
      icon: SearchCheck,
      title: i18next.t("knowledge.knowledgeLibraryOverview.ranblo"),
      tone: "neutral",
    };
  }
  if (props.visibleDocumentCount === 0) {
    return {
      action: "upload",
      description: i18next.t("knowledge.knowledgeLibraryOverview.ng9fys"),
      icon: Upload,
      title: i18next.t("knowledge.knowledgeLibraryOverview.ymayww"),
      tone: "info",
    };
  }
  if (props.searchableDocumentCount === 0) {
    return {
      action: "open_documents",
      description: i18next.t("knowledge.knowledgeLibraryOverview.ylfxrj"),
      icon: Database,
      title: i18next.t("knowledge.knowledgeLibraryOverview.eeacdk"),
      tone: "warning",
    };
  }
  return {
    action: "open_documents",
    description: `${props.searchableDocumentCount} 份资料可以参与检索。可查看版本、测试召回，或选择资料继续创作。`,
    icon: BookOpenCheck,
    title: i18next.t("knowledge.knowledgeLibraryOverview.y4s6zg"),
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
            <Upload className="h-4 w-4" />{i18next.t("knowledge.knowledgeDocumentsTab.a6m94b")}</Button>
        );
      case "retry":
        return (
          <Button type="button" size="sm" variant="outline" onClick={props.onRetry}>
            <RefreshCw className="h-4 w-4" />{i18next.t("common.retry")}</Button>
        );
      case "clear_filters":
        return (
          <Button type="button" size="sm" variant="outline" onClick={props.onClearFilters}>{i18next.t("visualAssets.visualAssetLibrary.ei6tl9")}</Button>
        );
      case "open_ops":
        return (
          <Button type="button" size="sm" variant="outline" onClick={props.onOpenOps}>{i18next.t("knowledge.knowledgeLibraryOverview.4xpwlg")}</Button>
        );
      default:
        if (props.isLoading) {
          return (
            <Button type="button" size="sm" variant="outline" disabled>{i18next.t("knowledge.knowledgeLibraryOverview.dws3b6")}</Button>
          );
        }
        return (
          <Button type="button" size="sm" variant="outline" onClick={props.onOpenDocuments}>{i18next.t("knowledge.knowledgeLibraryOverview.dlv4t7")}</Button>
        );
    }
  })();

  return (
    <>
      <AssetLibraryHeader
        icon={Database}
        context="创作资产 · 知识与检索"
        title={i18next.t("knowledge.knowledgeLibraryOverview.a7os77")}
        description={i18next.t("knowledge.knowledgeLibraryOverview.xdx2dl")}
        actions={(
          <>
            <Button type="button" onClick={props.onUpload}>
              <Upload className="h-4 w-4" />{i18next.t("knowledge.knowledgeDocumentsTab.a6m94b")}</Button>
            <OpenInCreativeHubButton
              bindings={{ knowledgeDocumentIds: props.selectedDocumentId ? [props.selectedDocumentId] : [] }}
              label={i18next.t("dict.gen_dbbdc047")}
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
            label: i18next.t("dict.gen_53ace430"),
            value: documentStatusUnavailable ? "—" : props.enabledCount,
            detail: "可被选择用于创作",
            icon: FileCheck2,
            tone: documentStatusUnavailable ? "neutral" : props.enabledCount > 0 ? "success" : "neutral",
          },
          {
            key: "searchable",
            label: i18next.t("knowledge.knowledgeLibraryOverview.ct30x"),
            value: documentStatusUnavailable ? "—" : props.searchableDocumentCount,
            detail: "已启用且索引完成",
            icon: SearchCheck,
            tone: documentStatusUnavailable
              ? "neutral"
              : props.searchableDocumentCount > 0 ? "success" : "warning",
          },
          {
            key: "index-jobs",
            label: i18next.t("knowledge.knowledgeLibraryOverview.dws4vy"),
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
