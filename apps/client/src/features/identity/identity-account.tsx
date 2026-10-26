import { useRef, useState } from "react";
import {
  Alert,
  Button,
  Group,
  PasswordInput,
  Stack,
  Text,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { getIdentityAccount, startIdentityLink } from "./identity-service";
import { identityErrorMessage } from "./identity-flow";
import { IdentityBrowserUnsupportedError } from "@/features/auth/auth-cookie-lock";

export function IdentityAccountSection() {
  const { t } = useTranslation();
  const location = useLocation();
  const query = useQuery({
    queryKey: ["identity-account"],
    queryFn: getIdentityAccount,
    staleTime: 0,
    refetchOnMount: true,
  });
  const [expanded, setExpanded] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pending = useRef(false);
  const params = new URLSearchParams(location.search);
  const callbackError = identityErrorMessage(params.get("identity_error"));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !password) return;
    pending.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const result = await startIdentityLink(password);
      setPassword("");
      // URL is produced by the authenticated backend from registered center configuration.
      const destination = new URL(result.url);
      if (
        destination.protocol !== "https:" ||
        destination.username ||
        destination.password
      )
        throw new Error("Invalid destination");
      window.location.assign(destination.href);
    } catch (err) {
      setPassword("");
      const code = err?.response?.data?.code ?? err?.response?.data?.message;
      setError(
        err instanceof IdentityBrowserUnsupportedError
          ? "This browser cannot safely start identity center sign-in. Use an up-to-date browser or your existing local account."
          : code === "identity_password_invalid"
          ? "Your current password could not be verified. Please try again."
          : code === "identity_assurance_required" ? identityErrorMessage(code)
          : "Account linking could not be started. Please try again.",
      );
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  }

  if (query.isPending) return null;
  if (query.isError)
    return (
      <Stack gap="xs" my="lg">
        <Text size="sm" role="alert">
          {t("Could not load identity center settings.")}
        </Text>
        <Button
          variant="subtle"
          onClick={() => query.refetch()}
          loading={query.isFetching}
          w="fit-content"
        >
          {t("Retry")}
        </Button>
      </Stack>
    );
  if (!query.data?.enabled) return null;

  return (
    <Stack gap="sm" my="lg">
      <Group justify="space-between" wrap="wrap">
        <div>
          <Text size="md">{t("Xianzhi Identity Center")}</Text>
          <Text size="sm" c="dimmed">
            {t(
              query.data.linked
                ? "Your account is linked. You can sign in through the identity center."
                : "Link your existing account to sign in through the identity center. Your workspace permissions stay the same.",
            )}
          </Text>
        </div>
        {!query.data.linked && !expanded && (
          <Button variant="subtle" onClick={() => setExpanded(true)}>
            {t("Link account")}
          </Button>
        )}
      </Group>
      {callbackError && (
        <Alert color="red" role="alert">
          {t(callbackError)}
        </Alert>
      )}
      {["1", "success"].includes(params.get("identity_linked")) &&
        query.data.linked && (
          <Text role="status" size="sm">
            {t("Account linked successfully.")}
          </Text>
        )}
      {expanded && !query.data.linked && (
        <form onSubmit={submit}>
          <Stack gap="sm" maw={420}>
            <PasswordInput
              autoFocus
              label={t("Current password")}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              required
              disabled={submitting}
            />
            <Text size="xs" c="dimmed">
              {t(
                "Verify your local password, then continue to the identity center. Never enter the identity center password here.",
              )}
            </Text>
            {error && (
              <Text role="alert" c="red" size="sm">
                {t(error)}
              </Text>
            )}
            <Group>
              <Button
                type="submit"
                color="black"
                radius={4}
                disabled={!password || submitting}
                loading={submitting}
              >
                {t("Verify and continue")}
              </Button>
              <Button
                variant="subtle"
                disabled={submitting}
                onClick={() => {
                  setExpanded(false);
                  setPassword("");
                  setError(null);
                }}
              >
                {t("Cancel")}
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </Stack>
  );
}
