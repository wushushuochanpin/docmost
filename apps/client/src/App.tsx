import { Suspense, useEffect } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Error404 } from "@/components/ui/error-404.tsx";
import {
  getShareLegacyRouteMode,
  isBackupEnabled,
  isCloud,
} from "@/lib/config.ts";
import { useRedirectToCloudSelect } from "@/ee/hooks/use-redirect-to-cloud-select.tsx";
import { useTrackOrigin } from "@/hooks/use-track-origin";
import APP_ROUTE from "@/lib/app-route.ts";
import {
  APP_NAVIGATE_EVENT,
  AUTH_UNAUTHORIZED_EVENT,
} from "@/lib/api-client.ts";
import { lazyWithRetry } from "@/lib/lazy-import.ts";
import Layout from "@/components/layouts/global/layout.tsx";

const SetupWorkspace = lazyWithRetry(
  () => import("@/pages/auth/setup-workspace.tsx"),
);
const LoginPage = lazyWithRetry(() => import("@/pages/auth/login"));
const Home = lazyWithRetry(() => import("@/pages/dashboard/home"));
const Page = lazyWithRetry(() => import("@/pages/page/page"));
const AccountSettings = lazyWithRetry(
  () => import("@/pages/settings/account/account-settings"),
);
const WorkspaceMembers = lazyWithRetry(
  () => import("@/pages/settings/workspace/workspace-members"),
);
const WorkspaceSettings = lazyWithRetry(
  () => import("@/pages/settings/workspace/workspace-settings"),
);
const Groups = lazyWithRetry(() => import("@/pages/settings/group/groups"));
const GroupInfo = lazyWithRetry(
  () => import("./pages/settings/group/group-info"),
);
const Spaces = lazyWithRetry(() => import("@/pages/settings/space/spaces.tsx"));
const AccountPreferences = lazyWithRetry(
  () => import("@/pages/settings/account/account-preferences.tsx"),
);
const SpaceHome = lazyWithRetry(() => import("@/pages/space/space-home.tsx"));
const PageRedirect = lazyWithRetry(
  () => import("@/pages/page/page-redirect.tsx"),
);
const InviteSignup = lazyWithRetry(
  () => import("@/pages/auth/invite-signup.tsx"),
);
const ForgotPassword = lazyWithRetry(
  () => import("@/pages/auth/forgot-password.tsx"),
);
const PasswordReset = lazyWithRetry(() => import("./pages/auth/password-reset"));
const Billing = lazyWithRetry(() => import("@/ee/billing/pages/billing.tsx"));
const CloudLogin = lazyWithRetry(() => import("@/ee/pages/cloud-login.tsx"));
const CreateWorkspace = lazyWithRetry(
  () => import("@/ee/pages/create-workspace.tsx"),
);
const Security = lazyWithRetry(() => import("@/ee/security/pages/security.tsx"));
const License = lazyWithRetry(() => import("@/ee/licence/pages/license.tsx"));
const SharedPage = lazyWithRetry(() => import("@/pages/share/shared-page.tsx"));
const Shares = lazyWithRetry(() => import("@/pages/settings/shares/shares.tsx"));
const ShareLayout = lazyWithRetry(
  () => import("@/features/share/components/share-layout.tsx"),
);
const ShareRedirect = lazyWithRetry(
  () => import("@/pages/share/share-redirect.tsx"),
);
const SpacesPage = lazyWithRetry(() => import("@/pages/spaces/spaces.tsx"));
const SpaceTrash = lazyWithRetry(() => import("@/pages/space/space-trash.tsx"));
const UserApiKeys = lazyWithRetry(
  () => import("@/features/compliance-admin/api-keys/pages/user-api-keys.tsx"),
);
const WorkspaceApiKeys = lazyWithRetry(
  () =>
    import("@/features/compliance-admin/api-keys/pages/workspace-api-keys.tsx"),
);
const AiSettings = lazyWithRetry(() => import("@/ee/ai/pages/ai-settings.tsx"));
const AuditLogs = lazyWithRetry(
  () => import("@/features/compliance-admin/audit/pages/audit-logs.tsx"),
);
const Backup = lazyWithRetry(() => import("@/pages/settings/backup/backup"));
const MfaChallengePage = lazyWithRetry(() =>
  import("@/ee/mfa/pages/mfa-challenge-page").then((module) => ({
    default: module.MfaChallengePage,
  })),
);
const MfaSetupRequiredPage = lazyWithRetry(() =>
  import("@/ee/mfa/pages/mfa-setup-required-page").then((module) => ({
    default: module.MfaSetupRequiredPage,
  })),
);

export default function App() {
  const shareLegacyRouteMode = getShareLegacyRouteMode();
  const navigate = useNavigate();
  const location = useLocation();

  useRedirectToCloudSelect();
  useTrackOrigin();

  useEffect(() => {
    const onUnauthorized = (event: Event) => {
      const authPaths = [
        APP_ROUTE.AUTH.LOGIN,
        APP_ROUTE.AUTH.SIGNUP,
        APP_ROUTE.AUTH.FORGOT_PASSWORD,
        APP_ROUTE.AUTH.PASSWORD_RESET,
        "/invites",
      ];
      if (authPaths.some((path) => location.pathname.startsWith(path))) {
        return;
      }

      const customEvent = event as CustomEvent<{ from?: string }>;
      const from =
        customEvent.detail?.from ??
        `${location.pathname}${location.search}${location.hash}`;

      navigate(APP_ROUTE.AUTH.LOGIN, {
        replace: true,
        state: { from },
      });
    };

    const onNavigate = (event: Event) => {
      const customEvent = event as CustomEvent<{
        to?: string;
        replace?: boolean;
        state?: Record<string, unknown>;
      }>;
      if (!customEvent.detail?.to) return;

      navigate(customEvent.detail.to, {
        replace: customEvent.detail.replace ?? true,
        state: customEvent.detail.state,
      });
    };

    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
    window.addEventListener(APP_NAVIGATE_EVENT, onNavigate);

    return () => {
      window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
      window.removeEventListener(APP_NAVIGATE_EVENT, onNavigate);
    };
  }, [location.hash, location.pathname, location.search, navigate]);

  return (
    <Suspense fallback={null}>
      <Routes>
        <Route index element={<Navigate to="/home" />} />
        <Route path={"/login"} element={<LoginPage />} />
        <Route path={"/invites/:invitationId"} element={<InviteSignup />} />
        <Route path={"/forgot-password"} element={<ForgotPassword />} />
        <Route path={"/password-reset"} element={<PasswordReset />} />
        <Route path={"/login/mfa"} element={<MfaChallengePage />} />
        <Route path={"/login/mfa/setup"} element={<MfaSetupRequiredPage />} />

        {!isCloud() && (
          <Route path={"/setup/register"} element={<SetupWorkspace />} />
        )}

        {isCloud() && (
          <>
            <Route path={"/create"} element={<CreateWorkspace />} />
            <Route path={"/select"} element={<CloudLogin />} />
          </>
        )}

        <Route element={<ShareLayout />}>
          <Route
            path={"/share/:shareId/:pageSlug"}
            element={<SharedPage />}
          />
          <Route
            path={"/share/:shareId/p/:pageSlug"}
            element={<SharedPage />}
          />
          {shareLegacyRouteMode !== "removed" && (
            <Route path={"/share/p/:pageSlug"} element={<SharedPage />} />
          )}
        </Route>

        <Route path={"/share/:shareId"} element={<ShareRedirect />} />
        <Route path={"/p/:pageSlug"} element={<PageRedirect />} />

        <Route element={<Layout />}>
          <Route path={"/home"} element={<Home />} />
          <Route path={"/spaces"} element={<SpacesPage />} />
          <Route path={"/s/:spaceSlug"} element={<SpaceHome />} />
          <Route path={"/s/:spaceSlug/trash"} element={<SpaceTrash />} />
          <Route path={"/s/:spaceSlug/p/:pageSlug"} element={<Page />} />

          <Route path={"/settings"}>
            <Route path={"account/profile"} element={<AccountSettings />} />
            <Route
              path={"account/preferences"}
              element={<AccountPreferences />}
            />
            <Route path={"account/api-keys"} element={<UserApiKeys />} />
            <Route path={"workspace"} element={<WorkspaceSettings />} />
            <Route path={"members"} element={<WorkspaceMembers />} />
            <Route path={"api-keys"} element={<WorkspaceApiKeys />} />
            <Route path={"groups"} element={<Groups />} />
            <Route path={"groups/:groupId"} element={<GroupInfo />} />
            <Route path={"spaces"} element={<Spaces />} />
            <Route path={"sharing"} element={<Shares />} />
            <Route path={"security"} element={<Security />} />
            <Route path={"ai"} element={<AiSettings />} />
            <Route path={"ai/mcp"} element={<AiSettings />} />
            <Route path={"audit"} element={<AuditLogs />} />
            {!isCloud() && isBackupEnabled() && (
              <>
                <Route path={"backup"} element={<Backup />} />
              </>
            )}
            {!isCloud() && (
              <>
                <Route path={"license"} element={<License />} />
              </>
            )}
            {isCloud() && <Route path={"billing"} element={<Billing />} />}
          </Route>
        </Route>

        <Route path="*" element={<Error404 />} />
      </Routes>
    </Suspense>
  );
}
