"use client";

import { useCallback, useEffect, useState } from "react";
import { toApiError } from "@/lib/axios";
import { unwrap } from "@/lib/codynexOs";

export function useApiQuery<T>(fetcher: () => Promise<{ data: unknown }>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetcher();
      setData(unwrap<T>(res.data));
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}
