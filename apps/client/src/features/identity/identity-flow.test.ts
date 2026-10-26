import { describe, expect, it } from "vitest";
import {
  identityErrorMessage,
  identityLoginUrl,
  identityReturnPath,
} from "./identity-flow";

describe("identity navigation contract", () => {
  it("keeps document and consent return destinations", () => {
    expect(identityReturnPath("/s/general/p/example?view=edit#section")).toBe(
      "/s/general/p/example?view=edit#section",
    );
    expect(
      identityReturnPath(
        "/oauth/consent?request_id=019a0000-1111-7111-8111-111111111111",
      ),
    ).toContain("/oauth/consent?");
    expect(identityLoginUrl("/settings/account/profile")).toBe(
      "/api/identity/start?returnTo=%2Fsettings%2Faccount%2Fprofile",
    );
  });
  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/api/auth/logout",
    "/oauth/consent?request_id=bad",
    "/oauth/consent?request_id=019a0000-1111-7111-8111-111111111111&redirect=https://evil.example",
  ])("rejects unsafe or unsupported destination %s", (path) => {
    expect(identityReturnPath(path)).toBe("/home");
  });
  it("maps unbound identities to local binding rather than automatic signup", () => {
    expect(identityErrorMessage("identity_not_linked")).toContain("invitation");
    expect(identityErrorMessage("<script>secret</script>")).not.toContain(
      "secret",
    );
  });
});
