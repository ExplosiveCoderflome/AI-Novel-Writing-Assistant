import i18next from "i18next";
import type { LucideIcon } from "lucide-react";
import {
  BookOpenCheck,
  CircleAlert,
  Database,
  LoaderCircle,
  RefreshCw,
  SearchCheck,
  Upload,
} from "lucide-react";
import {
  AssetLibraryHeader,
  AssetLibraryRecommendation,
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
      description: i18next.t("knowledge.knowledgeLibraryOverview.e8tdx3", { val1: props.activeJobCount }),
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
    description: i18next.t("knowledge.knowledgeLibraryOverview.5051gc", { val1: props.searchableDocumentCount }),
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

      <section aria-label={i18next.t("knowledge.knowledgeLibraryOverview.whs40v")} className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl bg-muted/25 px-5 py-3">
        {[
          { label: props.hasFilters ? "筛选结果" : "全部资料", value: documentStatusUnavailable ? "—" : props.visibleDocumentCount, dot: "bg-muted-foreground/45" },
          { label: i18next.t("dict.gen_53ace430"), value: documentStatusUnavailable ? "—" : props.enabledCount, dot: "bg-success" },
          { label: i18next.t("knowledge.knowledgeLibraryOverview.ct30x"), value: documentStatusUnavailable ? "—" : props.searchableDocumentCount, dot: "bg-success" },
          { label: i18next.t("knowledge.knowledgeLibraryOverview.ctvg4"), value: props.activeJobCount, dot: props.failedJobCount > 0 ? "bg-destructive" : "bg-info" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-sm">
            <span className={`h-2 w-2 rounded-full ${item.dot}`} aria-hidden="true" />
            <span className="text-muted-foreground">{item.label}</span>
            <span className="font-semibold tabular-nums text-foreground">{item.value}</span>
          </div>
        ))}
        {props.failedJobCount > 0 ? (
          <span className="text-xs text-destructive">{props.failedJobCount} 个索引任务需要处理</span>
        ) : null}
      </section>

      {recommendation.tone !== "success" ? (
        <AssetLibraryRecommendation
          icon={recommendation.icon}
          title={recommendation.title}
          description={recommendation.description}
          tone={recommendation.tone}
          action={recommendationAction}
        />
      ) : null}
    </>
  );
}
