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
      description: "The data list cannot be read at the moment. Reloading will not modify existing data or indexing tasks.",
      icon: CircleAlert,
      title: "Reload knowledge data",
      tone: "danger",
    };
  }
  if (props.isLoading) {
    return {
      action: "open_documents",
      description: "The data status and index results are being sorted, and the executable next step will be given after the loading is completed.",
      icon: LoaderCircle,
      title: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
      tone: "neutral",
    };
  }
  if (props.activeJobCount > 0) {
    return {
      action: "open_ops",
      description: `${props.activeJobCount} 个索引任务正在执行，可查看进度；创作时优先选择已完成索引的资料。`,
      icon: RefreshCw,
      title: "View data synchronization progress",
      tone: "info",
    };
  }
  if (props.failedIndexDocumentCount > 0 || props.failedJobCount > 0) {
    return {
      action: "open_ops",
      description: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
      icon: CircleAlert,
      title: "Process unfinished data indexing",
      tone: "warning",
    };
  }
  if (props.visibleDocumentCount === 0 && props.hasFilters) {
    return {
      action: "clear_filters",
      description: "There are no matching results for the current search or status criteria. Clear the filter to return to the complete information list.",
      icon: SearchCheck,
      title: "View other knowledge materials",
      tone: "neutral",
    };
  }
  if (props.visibleDocumentCount === 0) {
    return {
      action: "upload",
      description: "Upload a TXT file, and the system will create an index for use in book opening, planning, and text creation.",
      icon: Upload,
      title: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
      tone: "info",
    };
  }
  if (props.searchableDocumentCount === 0) {
    return {
      action: "open_documents",
      description: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
      icon: Database,
      title: "Prepare a searchable document",
      tone: "warning",
    };
  }
  return {
    action: "open_documents",
    description: `${props.searchableDocumentCount} 份资料可以参与检索。可查看版本、测试召回，或选择资料继续创作。`,
    icon: BookOpenCheck,
    title: "Select data to continue creating",
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
            Upload information
                          </Button>
        );
      case "retry":
        return (
          <Button type="button" size="sm" variant="outline" onClick={props.onRetry}>
            <RefreshCw className="h-4 w-4" />
            Reload
                          </Button>
        );
      case "clear_filters":
        return (
          <Button type="button" size="sm" variant="outline" onClick={props.onClearFilters}>
            Clear filters
                          </Button>
        );
      case "open_ops":
        return (
          <Button type="button" size="sm" variant="outline" onClick={props.onOpenOps}>
            View index status
                          </Button>
        );
      default:
        if (props.isLoading) {
          return (
            <Button type="button" size="sm" variant="outline" disabled>
              Loading
                              </Button>
          );
        }
        return (
          <Button type="button" size="sm" variant="outline" onClick={props.onOpenDocuments}>
            View profile
                          </Button>
        );
    }
  })();

  return (
    <>
      <AssetLibraryHeader
        icon={Database}
        context="Creation Assets · Knowledge and Retrieval"
        title="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
        description="Centrally manage reusable creative materials, confirm index status, and then bring reliable content into book opening, planning, and text creation."
        actions={(
          <>
            <Button type="button" onClick={props.onUpload}>
              <Upload className="h-4 w-4" />
              Upload information
                                </Button>
            <OpenInCreativeHubButton
              bindings={{ knowledgeDocumentIds: props.selectedDocumentId ? [props.selectedDocumentId] : [] }}
              label="Send to creative hub"
            />
          </>
        )}
      />

      <AssetLibraryStatusGrid
        items={[
          {
            key: "documents",
            label: props.hasFilters ? "Current filter results" : "Current information",
            value: documentStatusUnavailable ? "—" : props.visibleDocumentCount,
            detail: props.hasFilters ? "Statistics by current search and status conditions" : "Display unarchived data by default",
            icon: Files,
          },
          {
            key: "enabled",
            label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
            value: documentStatusUnavailable ? "—" : props.enabledCount,
            detail: "Can be selected for authoring",
            icon: FileCheck2,
            tone: documentStatusUnavailable ? "neutral" : props.enabledCount > 0 ? "success" : "neutral",
          },
          {
            key: "searchable",
            label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
            value: documentStatusUnavailable ? "—" : props.searchableDocumentCount,
            detail: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
            icon: SearchCheck,
            tone: documentStatusUnavailable
              ? "neutral"
              : props.searchableDocumentCount > 0 ? "success" : "warning",
          },
          {
            key: "index-jobs",
            label: "Synchronizing",
            value: props.activeJobCount,
            detail: props.failedJobCount > 0
              ? `${props.failedJobCount} records where the most recent indexing failure occurred.`
              : "There are no failed tasks to process",
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
