import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mobileRoot = dirname(fileURLToPath(import.meta.url));
const clientSrcRoot = resolve(mobileRoot, "../..");

function readSource(relativePath) {
  return readFileSync(join(clientSrcRoot, relativePath), "utf8");
}

function readMobileSource(relativePath) {
  return readFileSync(join(mobileRoot, relativePath), "utf8");
}

function assertContains(source, expected, message) {
  assert.ok(source.includes(expected), message);
}

function assertImportsMobileContracts(source, message) {
  assertContains(source, "@/mobile/autoDirector", message);
}

test("auto-director mobile support is centralized under the mobile directory", () => {
  const contracts = readMobileSource("mobileSupportContracts.ts");

  assertContains(
    contracts,
    "AUTO_DIRECTOR_MOBILE_ROUTE_PATTERNS",
    "mobile full-width route opt-in should live in the auto-director mobile directory",
  );
  assertContains(
    contracts,
    "AUTO_DIRECTOR_MOBILE_CLASSES",
    "mobile layout/style contracts should live in the auto-director mobile directory",
  );
  [
    "/auto-director/follow-ups",
    "/settings",
    "/novels/create",
    "/novels/:id/edit",
  ].forEach((routePattern) => {
    assertContains(
      contracts,
      routePattern,
      `${routePattern} should be opted into the centralized auto-director mobile route contract`,
    );
  });
});

test("auto-director follow-up center uses mobile contracts for single-column non-overflow layout", () => {
  const appLayout = readSource("components/layout/AppLayout.tsx");
  const page = readSource("pages/autoDirectorFollowUps/AutoDirectorFollowUpCenterPage.tsx");
  const overview = readSource("pages/autoDirectorFollowUps/components/AutoDirectorFollowUpOverview.tsx");
  const list = readSource("pages/autoDirectorFollowUps/components/AutoDirectorFollowUpList.tsx");
  const detail = readSource("pages/autoDirectorFollowUps/components/AutoDirectorFollowUpDetail.tsx");
  const batchBar = readSource("pages/autoDirectorFollowUps/components/AutoDirectorFollowUpBatchBar.tsx");

  assertImportsMobileContracts(appLayout, "app layout should import mobile route contracts instead of owning route exceptions");
  assertContains(
    appLayout,
    "shouldUseAutoDirectorMobileFullWidthContent",
    "auto-director target routes should opt into mobile full-width content through the mobile directory",
  );
  assertContains(
    appLayout,
    "hidden md:block",
    "project/workspace side navigation should not squeeze auto-director target pages at phone width",
  );
  assertContains(
    appLayout,
    "AUTO_DIRECTOR_MOBILE_CLASSES.appMain",
    "app main mobile-safe sizing should be imported from the mobile directory",
  );
  assertContains(
    appLayout,
    "useMobileFullWidthContent ? AUTO_DIRECTOR_MOBILE_CLASSES.appMain : DEFAULT_APP_MAIN_CLASS_NAME",
    "auto-director mobile app main sizing should be route-scoped instead of changing every page shell",
  );

  const navbar = readSource("components/layout/Navbar.tsx");
  assertImportsMobileContracts(navbar, "navbar should import mobile shell contracts for auto-director target routes");
  assertContains(
    navbar,
    "shouldUseAutoDirectorMobileFullWidthContent",
    "navbar mobile shell changes should be scoped by the auto-director route opt-in",
  );
  assertContains(
    navbar,
    "AUTO_DIRECTOR_MOBILE_CLASSES.navbarModelSelector",
    "the global model selector should not force auto-director target pages wider than a phone viewport",
  );
  assertContains(
    navbar,
    "AUTO_DIRECTOR_MOBILE_CLASSES.navbarWorkspaceToggle",
    "workspace navigation toggle should not compete with mobile page actions at phone width",
  );

  assertImportsMobileContracts(page, "follow-up page should use the mobile directory as the layout contract source");
  assertContains(
    page,
    "AUTO_DIRECTOR_MOBILE_CLASSES.followUpPageRoot",
    "follow-up center root should prevent horizontal overflow on mobile",
  );
  assertContains(
    page,
    "AUTO_DIRECTOR_MOBILE_CLASSES.followUpMasterDetailGrid",
    "follow-up list/detail grid should allow children to shrink on narrow screens",
  );
  assertImportsMobileContracts(overview, "follow-up overview should use mobile section grid contracts");
  assertContains(
    overview,
    "AUTO_DIRECTOR_MOBILE_CLASSES.followUpOverviewGrid",
    "follow-up section cards should be one column at phone width",
  );
  assertImportsMobileContracts(list, "follow-up list should use mobile list contracts");
  assertContains(
    list,
    "AUTO_DIRECTOR_MOBILE_CLASSES.followUpListHeader",
    "follow-up list item header should stack before switching to row layout",
  );
  assertImportsMobileContracts(detail, "follow-up detail should use mobile detail contracts");
  assertContains(
    detail,
    "AUTO_DIRECTOR_MOBILE_CLASSES.wrapText",
    "follow-up detail should wrap long URLs, task ids, and channel targets",
  );
  assertImportsMobileContracts(batchBar, "follow-up batch bar should use mobile batch action contracts");
  assertContains(
    batchBar,
    "AUTO_DIRECTOR_MOBILE_CLASSES.followUpBatchBar",
    "mobile batch action bar should stay reachable after scrolling long lists",
  );
});

test("auto-director dialogs expose mobile-safe scroll containers and reachable action areas through mobile contracts", () => {
  const newBookDialog = readSource("pages/novels/components/NovelAutoDirectorDialog.tsx");
  const setupPanel = readSource("pages/novels/components/NovelAutoDirectorSetupPanel.tsx");
  const candidateBatches = readSource("pages/novels/components/NovelAutoDirectorCandidateBatches.tsx");
  const takeoverDialog = readSource("pages/novels/components/NovelExistingProjectTakeoverDialog.tsx");

  assertImportsMobileContracts(newBookDialog, "new-book dialog should import mobile dialog contracts");
  assertContains(
    newBookDialog,
    "AUTO_DIRECTOR_MOBILE_CLASSES.dialogContent",
    "new-book auto-director dialog should fit the mobile viewport height",
  );
  assertContains(
    newBookDialog,
    "AUTO_DIRECTOR_MOBILE_CLASSES.dialogBody",
    "new-book auto-director dialog body should use tighter mobile padding and scroll",
  );
  assertImportsMobileContracts(setupPanel, "new-book setup panel should import mobile action contracts");
  assertContains(
    setupPanel,
    "AUTO_DIRECTOR_MOBILE_CLASSES.actionRow",
    "new-book setup primary action should stay full-width and reachable on phones",
  );
  assertImportsMobileContracts(candidateBatches, "candidate batches should import mobile action contracts");
  assertContains(
    candidateBatches,
    "AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction",
    "candidate actions should become full-width touch targets on mobile",
  );
  assertImportsMobileContracts(takeoverDialog, "takeover dialog should import mobile dialog contracts");
  assertContains(
    takeoverDialog,
    "AUTO_DIRECTOR_MOBILE_CLASSES.takeoverSubmitBar",
    "takeover submit area should remain reachable after long mobile content",
  );
});

test("auto-approval preference controls wrap labels and save actions on mobile through mobile contracts", () => {
  const multiSelect = readSource("components/autoDirector/AutoDirectorApprovalPointMultiSelect.tsx");
  const strategyPanel = readSource("components/autoDirector/AutoDirectorApprovalStrategyPanel.tsx");
  const settingsPage = readSource("pages/settings/SettingsPage.tsx");
  const preferenceCard = readSource("pages/settings/AutoDirectorApprovalPreferenceCard.tsx");
  const channelSettingsCard = readSource("pages/settings/AutoDirectorChannelSettingsCard.tsx");
  const settingsNavigationCards = readSource("pages/settings/components/SettingsNavigationCards.tsx");

  assertImportsMobileContracts(settingsPage, "settings route should import mobile settings contracts");
  assertContains(
    settingsPage,
    "AUTO_DIRECTOR_MOBILE_CLASSES.settingsPageRoot",
    "settings route should prevent neighboring settings cards from widening the auto-approval preference path on phones",
  );
  assertImportsMobileContracts(multiSelect, "approval point multiselect should import mobile wrapping contracts");
  assertContains(
    multiSelect,
    "AUTO_DIRECTOR_MOBILE_CLASSES.wrapText",
    "approval group and point labels should wrap instead of forcing horizontal scroll",
  );
  assertImportsMobileContracts(strategyPanel, "approval strategy panel should import mobile choice grid contracts");
  assertContains(
    strategyPanel,
    "AUTO_DIRECTOR_MOBILE_CLASSES.approvalStrategyGrid",
    "AI push/copilot choice cards should stay single-column at phone width",
  );
  assertImportsMobileContracts(preferenceCard, "preference card should import mobile settings action contracts");
  assertContains(
    preferenceCard,
    "AUTO_DIRECTOR_MOBILE_CLASSES.settingsActionRow",
    "settings save action should be full-width on phones and compact on desktop",
  );
  assertImportsMobileContracts(channelSettingsCard, "channel settings card should import mobile settings action contracts");
  assertContains(
    channelSettingsCard,
    "AUTO_DIRECTOR_MOBILE_CLASSES.channelSettingsActionRow",
    "channel settings actions should remain reachable while reviewing auto-approval preferences on phones",
  );
  assertImportsMobileContracts(settingsNavigationCards, "settings navigation cards should import mobile settings entry contracts");
  assertContains(
    settingsNavigationCards,
    "AUTO_DIRECTOR_MOBILE_CLASSES.settingsEntryActionRow",
    "settings entry cards should not push action buttons outside the phone viewport",
  );
});
