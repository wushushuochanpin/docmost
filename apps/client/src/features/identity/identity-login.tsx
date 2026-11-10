import { Alert, Button, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { IdentityAction } from "@wushushuochanpin/identity-react/action";
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
  const [startError, setStartError] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ["identity-status"],
    queryFn: getIdentityStatus,
    staleTime: 0,
    refetchOnMount: true,
  });
  const errorCode = new URLSearchParams(location.search).get("identity_error");
  const error = identityErrorMessage(errorCode);
  const returnTo = getRedirectParam() ?? location.state?.from;
  async function start(reauthenticate: boolean) {
    setStartError(null);
    await beginIdentityLogin(returnTo, undefined, reauthenticate);
  }
  function handleStartError(failure: unknown) {
    setStartError(
      failure instanceof IdentityBrowserUnsupportedError
        ? "This browser cannot safely start identity center sign-in. Use an up-to-date browser or your existing local account."
        : "Identity center sign-in could not be started. Please try again or use your existing local account.",
    );
  }
  // Failed callbacks remain explainable even if an administrator disabled the feature.
  if (!data?.enabled && !error) return null;
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
          <IdentityAction action={start} onError={handleStartError}>
            {({ busy, run }) => (
              <Button
                onClick={() => void run(errorCode === "identity_not_linked")}
                loading={busy}
                disabled={busy}
                fullWidth
                color="black"
                radius={4}
              >
                {t(errorCode === "identity_not_linked" ? "Scan again or switch account" : "Sign in with Xianzhi Identity Center")}
              </Button>
            )}
          </IdentityAction>
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
