import { useCallback } from "react";
import { del, get, set } from "idb-keyval";

export function useLocalDB() {
  const getItem = useCallback(async <T>(key: string): Promise<T | undefined> => {
    return get<T>(key);
  }, []);

  const setItem = useCallback(async <T>(key: string, value: T): Promise<void> => {
    await set(key, value);
  }, []);

  const removeItem = useCallback(async (key: string): Promise<void> => {
    await del(key);
  }, []);

  return { getItem, setItem, removeItem };
}
