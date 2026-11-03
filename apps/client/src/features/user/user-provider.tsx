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
import { notifications } from "@mantine/notifications";
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
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectAttempts = 0;
    const socketGeneration = captureAuthGeneration();
    const newSocket = io(SOCKET_URL, {
      transports: ["websocket"],
      withCredentials: true,
    });

    const clearReconnect = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
    };
    const scheduleReconnect = () => {
      if (disposed || isAuthInvalidated()) return;
      // Bounded backoff avoids a tight reconnect loop during a center outage.
      const delay = Math.min(30_000, 5_000 * 2 ** reconnectAttempts++);
      clearReconnect();
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        if (!disposed && !isAuthInvalidated() && isCurrentAuthGeneration(socketGeneration))
          newSocket.connect();
      }, delay);
    };

    // @ts-ignore
    setSocket(newSocket);

    newSocket.on("Unauthorized", () => {
      if (!disposed && isCurrentAuthGeneration(socketGeneration)) invalidateAuthSession();
    });

    newSocket.on("SessionVerificationUnavailable", () => {
      if (disposed || !isCurrentAuthGeneration(socketGeneration)) return;
      notifications.show({
        id: "session-verification-unavailable",
        message: i18n.t(
          "The identity center is temporarily unavailable. Your sign-in is still valid; retrying.",
        ),
        color: "yellow",
        autoClose: false,
      });
      scheduleReconnect();
    });

    newSocket.on("connect", () => {
      console.log("ws connected");
      reconnectAttempts = 0;
      clearReconnect();
      notifications.hide("session-verification-unavailable");
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
      clearReconnect();
      console.log("ws disconnected");
      newSocket.disconnect();
    };
  }, [isError, isLoading, invalidated, data?.user?.id, i18n]);

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
    const message =
      reason === "logout"
        ? "This view is locked while sign-out completes. If it does not finish, retry sign-out."
        : reason === "expired"
          ? "Your session expired. Sign in again to continue."
          : "Your sign-in state changed. Open sign-in again to verify the current account.";
    return (
      <Center h="100vh">
        <Box ta="center" p="lg">
          <Text mb="sm">{t(message)}</Text>
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
    const code =
      error?.["response"]?.data?.code ?? error?.["response"]?.data?.message;
    const isUnauthorized = status === 401;
    if (isUnauthorized) {
      const from = `${location.pathname}${location.search}${location.hash}`;
      return <Navigate to={APP_ROUTE.AUTH.LOGIN} replace state={{ from }} />;
    }
    const isIdentityUnavailable =
      status === 503 || code === "identity_unavailable";
    return (
      <Center
        h="100vh"
        style={{ background: "var(--mantine-color-gray-0, #f6f7f9)" }}
      >
        <Box ta="center">
          <Text c="dimmed" mb="sm">
            {isIdentityUnavailable
              ? t(
                  "The identity center is temporarily unavailable. Your sign-in is still valid. Please retry shortly.",
                )
              : "加载失败，请检查网络或稍后重试"}
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
