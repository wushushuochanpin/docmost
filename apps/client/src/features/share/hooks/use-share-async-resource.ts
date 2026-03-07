import { DependencyList, useEffect, useReducer, useRef, useState } from "react";

interface UseShareAsyncResourceOptions {
  enabled?: boolean;
  keepPreviousData?: boolean;
}

export function useShareAsyncResource<T>(
  loader: (() => Promise<T>) | null,
  deps: DependencyList,
  options: UseShareAsyncResourceOptions = {},
) {
  const { enabled = true, keepPreviousData = false } = options;
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState(Boolean(enabled && loader));
  const [reloadKey, reload] = useReducer((value) => value + 1, 0);
  const requestIdRef = useRef(0);
  const loaderRef = useRef(loader);

  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);

  useEffect(() => {
    const currentLoader = loaderRef.current;

    if (!enabled || !currentLoader) {
      if (!keepPreviousData) {
        setData(undefined);
      }
      setError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setIsLoading(true);
    setError(null);
    if (!keepPreviousData) {
      setData(undefined);
    }

    void currentLoader()
      .then((nextData) => {
        if (cancelled || requestId !== requestIdRef.current) {
          return;
        }

        setData(nextData);
        setIsLoading(false);
      })
      .catch((nextError) => {
        if (cancelled || requestId !== requestIdRef.current) {
          return;
        }

        setError(nextError);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, keepPreviousData, Boolean(loader), reloadKey, ...deps]);

  return {
    data,
    error,
    isLoading,
    isError: Boolean(error),
    refetch: reload,
    setData,
  };
}
