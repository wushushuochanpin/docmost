import { Alert, Button, Stack, Text } from "@mantine/core";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { getRedirectParam } from "@/lib/app-route";
import { getIdentityStatus } from "./identity-service";
import { identityErrorMessage } from "./identity-flow";
import {
  beginIdentityLogin,
  IdentityBrowserUnsupportedError,
} from "./identity-bootstrap";

export function IdentityLogin() {
  const { t } = useTranslation();
  const location = useLocation();
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const pending = useRef(false);
  const { data } = useQuery({
    queryKey: ["identity-status"],
    queryFn: getIdentityStatus,
    staleTime: 0,
    refetchOnMount: true,
  });
  const error = identityErrorMessage(
    new URLSearchParams(location.search).get("identity_error"),
  );
  // Failed callbacks remain explainable even if an administrator disabled the feature.
  if (!data?.enabled && !error) return null;

  const returnTo = getRedirectParam() ?? location.state?.from;
  async function start() {
    if (pending.current) return;
    pending.current = true;
    setStarting(true);
    setStartError(null);
    try {
      await beginIdentityLogin(returnTo);
    } catch (failure) {
      setStartError(
        failure instanceof IdentityBrowserUnsupportedError
          ? "This browser cannot safely start identity center sign-in. Use an up-to-date browser or your existing local account."
          : "Identity center sign-in could not be started. Please try again or use your existing local account.",
      );
    } finally {
      pending.current = false;
      setStarting(false);
    }
  }
  return (
    <Stack gap="sm" mb="md">
      {error && (
        <Alert color="red" role="alert">
          {t(error)}
        </Alert>
      )}
      {startError && (
        <Alert color="red" role="alert">
          {t(startError)}
        </Alert>
      )}
      {data?.enabled && (
        <>
          <Button
            onClick={start}
            loading={starting}
            disabled={starting}
            fullWidth
            color="black"
            radius={4}
          >
            {t("Sign in with Xianzhi Identity Center")}
          </Button>
          <Text size="xs" c="dimmed">
            {t(
              "Use your linked account. New members need a workspace invitation.",
            )}
          </Text>
        </>
      )}
    </Stack>
  );
}
