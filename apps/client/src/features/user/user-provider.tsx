import { useAtom } from "jotai";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";
import React, { useEffect, useSyncExternalStore } from "react";
import useCurrentUser from "@/features/user/hooks/use-current-user";
import { useTranslation } from "react-i18next";
import { socketAtom } from "@/features/websocket/atoms/socket-atom.ts";
import { io } from "socket.io-client";
import { SOCKET_URL } from "@/features/websocket/types";
import { useQuerySubscription } from "@/features/websocket/use-query-subscription.ts";
import { useTreeSocket } from "@/features/websocket/use-tree-socket.ts";
import { useNotificationSocket } from "@/features/notification/hooks/use-notification-socket.ts";
import { Error404 } from "@/components/ui/error-404.tsx";
import { Box, Button, Center, Loader, Text } from "@mantine/core";
import { captureAuthGeneration, getAuthInvalidationReason, invalidateAuthSession, isAuthInvalidated, isCurrentAuthGeneration, subscribeAuthLifecycle } from "@/features/auth/session-lifecycle";
import useAuth from "@/features/auth/hooks/use-auth";
import APP_ROUTE from "@/lib/app-route.ts";
import { Navigate, useLocation } from "react-router-dom";
import {
  ensureUniqueEditorSessionClientId,
  startEditorSessionClientIdResponder,
} from "@/features/editor-session/client-id";

export function UserProvider({ children }: React.PropsWithChildren) {
  const invalidated = useSyncExternalStore(subscribeAuthLifecycle, isAuthInvalidated);
  const { logout, isLoading: isLoggingOut } = useAuth();
  const [, setCurrentUser] = useAtom(currentUserAtom);
  const { data, isLoading, error, isError, refetch } = useCurrentUser({ enabled: !invalidated });
  const { i18n, t } = useTranslation();
  const [, setSocket] = useAtom(socketAtom);
  const location = useLocation();

  useEffect(() => {
    startEditorSessionClientIdResponder();
  }, []);

  useEffect(() => {
    if (isLoading || isError || invalidated || !data?.user) {
      return;
    }

    let disposed = false;
    const socketGeneration = captureAuthGeneration();
    const newSocket = io(SOCKET_URL, {
      transports: ["websocket"],
      withCredentials: true,
    });

    // @ts-ignore
    setSocket(newSocket);

    newSocket.on("Unauthorized", () => {
      if (!disposed && isCurrentAuthGeneration(socketGeneration)) invalidateAuthSession();
    });

    newSocket.on("connect", () => {
      console.log("ws connected");
      ensureUniqueEditorSessionClientId().then((clientId) => {
        if (disposed || isAuthInvalidated()) return;
        newSocket.emit("message", {
          operation: "editorSession.registerClient",
          clientId,
        });
      });
    });

    return () => {
      disposed = true;
      console.log("ws disconnected");
      newSocket.disconnect();
    };
  }, [isError, isLoading, invalidated, data?.user?.id]);

  useQuerySubscription();
  useTreeSocket();
  useNotificationSocket();

  useEffect(() => {
    if (!invalidated && data && data.user && data.workspace) {
      setCurrentUser(data);
      i18n.changeLanguage(
        data.user.locale === "en" ? "en-US" : data.user.locale,
      );
    }
  }, [data, isLoading, invalidated]);

  useEffect(() => {
    document.documentElement.lang = i18n.resolvedLanguage || i18n.language || "en-US";
  }, [i18n.language, i18n.resolvedLanguage]);

  if (invalidated) {
    const reason = getAuthInvalidationReason();
    return (
      <Center h="100vh">
        <Box ta="center" p="lg">
          <Text mb="sm">{t(reason === "logout" ? "This view is locked while sign-out completes. If it does not finish, retry sign-out." : "Your sign-in state changed. Open sign-in again to verify the current account.")}</Text>
          {reason === "logout"
            ? <Button onClick={logout} loading={isLoggingOut} color="black" radius={4}>{t("Retry sign-out")}</Button>
            : <Button component="a" href={`/login?logout=1&redirect=${encodeURIComponent(`${location.pathname}${location.search}${location.hash}`)}`} color="black" radius={4}>{t("Go to sign-in")}</Button>}
        </Box>
      </Center>
    );
  }

  if (isLoading) {
    return (
      <Center
        h="100vh"
        style={{ background: "var(--mantine-color-gray-0, #f6f7f9)" }}
      >
        <Loader size="lg" color="blue" />
      </Center>
    );
  }

  if (isError && error?.["response"]?.status === 404) {
    return <Error404 />;
  }

  if (error) {
    const status = error?.["response"]?.status;
    const isUnauthorized = status === 401;
    if (isUnauthorized) {
      const from = `${location.pathname}${location.search}${location.hash}`;
      return <Navigate to={APP_ROUTE.AUTH.LOGIN} replace state={{ from }} />;
    }
    return (
      <Center
        h="100vh"
        style={{ background: "var(--mantine-color-gray-0, #f6f7f9)" }}
      >
        <Box ta="center">
          <Text c="dimmed" mb="sm">
            加载失败，请检查网络或稍后重试
          </Text>
          <Text
            component="button"
            size="sm"
            variant="link"
            type="button"
            onClick={() => refetch()}
          >
            重试
          </Text>
        </Box>
      </Center>
    );
  }

  return <>{children}</>;
}
