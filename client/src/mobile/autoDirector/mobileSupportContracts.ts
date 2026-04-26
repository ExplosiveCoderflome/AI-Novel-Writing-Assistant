import { matchPath } from "react-router-dom";

export const AUTO_DIRECTOR_MOBILE_ROUTE_PATTERNS = [
  "/auto-director/follow-ups",
  "/settings",
  "/novels/create",
  "/novels/:id/edit",
] as const;

export function shouldUseAutoDirectorMobileFullWidthContent(pathname: string): boolean {
  return AUTO_DIRECTOR_MOBILE_ROUTE_PATTERNS.some((pattern) => Boolean(matchPath(pattern, pathname)));
}

export const AUTO_DIRECTOR_MOBILE_CLASSES = {
  actionRow: "flex flex-col gap-2 sm:flex-row sm:justify-end",
  appMain: "h-[calc(100vh-4rem)] min-w-0 flex-1 overflow-y-auto p-4 md:p-6",
  approvalStrategyGrid: "mt-3 grid gap-3 sm:grid-cols-2",
  channelSettingsActionRow: "grid grid-cols-1 gap-2 sm:flex sm:items-center sm:justify-end",
  dialogBody: "min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-5 pt-4 sm:px-6 sm:pb-6",
  dialogContent:
    "flex h-[min(92vh,980px)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] flex-col overflow-hidden p-0 sm:w-[calc(100vw-1.5rem)] sm:max-w-[calc(100vw-1.5rem)]",
  followUpBatchBar: "sticky bottom-3 z-20 min-w-0 border-primary/20 shadow-lg",
  followUpFilterGrid: "auto-director-follow-up-filter-grid grid min-w-0 gap-2 md:grid-cols-2 xl:grid-cols-3",
  followUpFilterTrigger: "h-9 rounded-md px-2 text-xs sm:h-11 sm:rounded-xl sm:px-3 sm:text-sm",
  followUpListHeader: "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
  followUpMasterDetailGrid: "grid min-w-0 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]",
  followUpOverviewCard: "auto-director-follow-up-overview-card min-w-0",
  followUpOverviewGrid: "grid min-w-0 grid-cols-1 gap-3",
  followUpOverviewHeader: "flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between",
  followUpOverviewSectionGrid: "auto-director-follow-up-section-grid grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6",
  followUpPageRoot: "mobile-page-follow-ups w-full max-w-full overflow-x-hidden space-y-4",
  fullWidthAction: "w-full sm:w-auto",
  navbarModelSelector: "hidden sm:block",
  navbarWorkspaceToggle: "hidden sm:inline-flex",
  settingsActionRow: "flex flex-col gap-2 sm:flex-row sm:justify-end",
  settingsEntryActionRow: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
  settingsPageRoot: "w-full max-w-full overflow-x-hidden space-y-4",
  takeoverDialogContent:
    "flex h-[min(90vh,860px)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] flex-col overflow-hidden p-0 lg:max-w-5xl",
  takeoverSubmitBar: "sticky bottom-0 -mx-4 mt-4 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6",
  wrapText: "break-words [overflow-wrap:anywhere]",
} as const;
