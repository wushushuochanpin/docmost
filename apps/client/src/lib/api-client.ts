import axios, { AxiosInstance } from "axios";
import APP_ROUTE from "@/lib/app-route.ts";
import { isCloud } from "@/lib/config.ts";

export const AUTH_UNAUTHORIZED_EVENT = "docmost:auth:unauthorized";
export const APP_NAVIGATE_EVENT = "docmost:app:navigate";

const api: AxiosInstance = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => {
    // we need the response headers for these endpoints
    const exemptEndpoints = [
      "/api/pages/export",
      "/api/pages/export/pdf",
      "/api/spaces/export",
    ];
    if (response.request.responseURL) {
      const path = new URL(response.request.responseURL)?.pathname;
      if (path && exemptEndpoints.includes(path)) {
        return response;
      }
    }

    return response.data;
  },
  (error) => {
    if (error.response) {
      switch (error.response.status) {
        case 401: {
          const url = new URL(error.request.responseURL)?.pathname;
          if (url === "/api/auth/collab-token") return;
          if (window.location.pathname.startsWith("/share/")) return;

          // Handle unauthorized error
          redirectToLogin();
          break;
        }
        case 403:
          // Handle forbidden error
          break;
        case 404:
          {
            // Handle not found error
            const notFoundMessage = error?.response?.data?.message;
            if (
              typeof notFoundMessage === "string" &&
              notFoundMessage.toLowerCase().includes("workspace not found")
            ) {
              console.log("workspace not found");
              if (
                !isCloud() &&
                window.location.pathname != APP_ROUTE.AUTH.SETUP
              ) {
                window.dispatchEvent(
                  new CustomEvent(APP_NAVIGATE_EVENT, {
                    detail: {
                      to: APP_ROUTE.AUTH.SETUP,
                      replace: true,
                    },
                  }),
                );
              }
            }
          }
          break;
        case 500:
          // Handle internal server error
          break;
        default:
          break;
      }
    }
    return Promise.reject(error);
  },
);

function redirectToLogin() {
  const exemptPaths = [
    APP_ROUTE.AUTH.LOGIN,
    APP_ROUTE.AUTH.SIGNUP,
    APP_ROUTE.AUTH.FORGOT_PASSWORD,
    APP_ROUTE.AUTH.PASSWORD_RESET,
    APP_ROUTE.AUTH.MFA_CHALLENGE,
    APP_ROUTE.AUTH.MFA_SETUP_REQUIRED,
    "/invites",
  ];
  if (!exemptPaths.some((path) => window.location.pathname.startsWith(path))) {
    window.dispatchEvent(
      new CustomEvent(AUTH_UNAUTHORIZED_EVENT, {
        detail: {
          from: `${window.location.pathname}${window.location.search}${window.location.hash}`,
        },
      }),
    );
  }
}

export default api;
