import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAutoDirectorFollowUps } from "@/api/autoDirectorFollowUps";
import {
  AUTO_DIRECTOR_PAUSE_NOTIFICATION_SETTINGS_EVENT,
  getBrowserNotificationPermission,
  getStoredAutoDirectorPauseActionableIds,
  isAutoDirectorPauseNotificationEnabled,
  isAutoDirectorPauseNotificationItem,
  setStoredAutoDirectorPauseActionableIds,
  showAutoDirectorPauseNotification,
} from "@/lib/autoDirectorPauseNotifications";

const QUERY_PARAMS_KEY = "auto-director-pause-notifications";

function buildFollowUpTargetUrl(directorTaskId: string): string {
  return `/auto-director/follow-ups?directorTaskId=${encodeURIComponent(directorTaskId)}`;
}

export default function AutoDirectorPauseNotificationWatcher() {
  const [settingsVersion, setSettingsVersion] = useState(0);
  const handledIdsRef = useRef<string[]>([]);
  const notificationsEnabled = isAutoDirectorPauseNotificationEnabled();
  const permission = getBrowserNotificationPermission();
  const canQueryNotifications = notificationsEnabled && permission === "granted";

  useEffect(() => {
    const handleSettingsChange = () => setSettingsVersion((current) => current + 1);
    window.addEventListener(AUTO_DIRECTOR_PAUSE_NOTIFICATION_SETTINGS_EVENT, handleSettingsChange);
    window.addEventListener("storage", handleSettingsChange);
    return () => {
      window.removeEventListener(AUTO_DIRECTOR_PAUSE_NOTIFICATION_SETTINGS_EVENT, handleSettingsChange);
      window.removeEventListener("storage", handleSettingsChange);
    };
  }, []);

  const listQuery = useQuery({
    queryKey: ["auto-director-pause-notifications", QUERY_PARAMS_KEY, settingsVersion],
    queryFn: () => listAutoDirectorFollowUps({ page: 1, pageSize: 20 }),
    enabled: canQueryNotifications,
    refetchInterval: canQueryNotifications ? 15_000 : false,
    refetchOnWindowFocus: true,
  });

  const actionableItems = useMemo(
    () => (listQuery.data?.data?.items ?? []).filter(isAutoDirectorPauseNotificationItem),
    [listQuery.data?.data?.items],
  );

  useEffect(() => {
    if (!canQueryNotifications || !listQuery.isSuccess) {
      return;
    }

    const actionableIds = actionableItems.map((item) => item.directorTaskId);
    if (actionableIds.join("|") === handledIdsRef.current.join("|")) {
      return;
    }

    const storedIds = getStoredAutoDirectorPauseActionableIds();
    const newItem = actionableItems.find((item) => !storedIds.includes(item.directorTaskId));
    if (newItem) {
      showAutoDirectorPauseNotification({
        item: newItem,
        targetUrl: buildFollowUpTargetUrl(newItem.directorTaskId),
      });
    }

    handledIdsRef.current = actionableIds;
    setStoredAutoDirectorPauseActionableIds(actionableIds);
  }, [actionableItems, canQueryNotifications, listQuery.isSuccess]);

  return null;
}
