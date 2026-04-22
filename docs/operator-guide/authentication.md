<!-- audience: public -->

# Authentication

Authentication is **off by default** — the wizard runs without
credentials so local / single-user setups work out of the box. For any
shared, multi-user, or internet-exposed deployment, pick an auth
strategy via `EMBEDIQ_AUTH_STRATEGY` and configure its env vars.

Three strategies ship:

| Strategy | Use when | Pros | Cons |
|---|---|---|---|
| **Basic** | Quick private deploy, single admin account | Zero external dependency, trivial setup | One shared credential, no roles out of the box |
| **OIDC** | Enterprise SSO (Okta, Auth0, Azure AD, Keycloak, Google) | Real users + real role claims, central revocation | Requires an IdP + a bit of claim mapping |
| **Proxy header** | Already behind an identity-aware proxy (IAP, Pomerium, Teleport, oauth2-proxy) | Reuse existing SSO; EmbedIQ just trusts the proxy | Must guarantee no direct ingress; trust is upstream |

When no strategy is set, the server logs `Auth: none (open mode)` at
startup and every route is anonymous.

## Recommendation matrix

| You have… | Use |
|---|---|
| A single admin and a VPN or SSH tunnel | `EMBEDIQ_AUTH_STRATEGY=basic` |
| Workforce SSO (Okta / Google Workspace / Azure AD / etc.) and no proxy | `EMBEDIQ_AUTH_STRATEGY=oidc` |
| Already deployed identity-aware proxy in front of all internal apps | `EMBEDIQ_AUTH_STRATEGY=proxy` |
| Public-ish multi-tenant deployment | `oidc` + a reverse proxy with WAF + rate limiting |

## Roles (RBAC)

EmbedIQ recognizes two roles:

| Role | Capabilities |
|---|---|
| `wizard-user` | Run the wizard, read their own session, generate output, consume compliance/autopilot webhooks when routed via normal auth. |
| `wizard-admin` | All `wizard-user` capabilities **plus** generate-to-disk (`POST /api/generate`), list all sessions, export session dumps. |

Role enforcement is handled by [`requireRole()`](../../src/web/middleware/rbac.ts).
Users without a role are treated as anonymous and cannot touch role-
gated endpoints.

## Strategy 1 — Basic auth

```bash
EMBEDIQ_AUTH_STRATEGY=basic \
  EMBEDIQ_AUTH_USER=admin \
  EMBEDIQ_AUTH_PASS=$(openssl rand -hex 32) \
  npm run start:web
```

Behavior:

- Every non-health-probe endpoint requires `Authorization: Basic …`.
- The authenticated user's `userId` is set to `EMBEDIQ_AUTH_USER` and
  their roles default to `['wizard-admin']`.
- No separate user database — there's one account.

Basic auth with just `EMBEDIQ_AUTH_USER` + `EMBEDIQ_AUTH_PASS` set
(without `EMBEDIQ_AUTH_STRATEGY=basic`) also works — EmbedIQ detects
the credentials and enables the strategy automatically. Keep this in
mind when upgrading: if you were relying on this auto-detection,
nothing changes. For an explicit opt-out, set
`EMBEDIQ_AUTH_STRATEGY=none`.

## Strategy 2 — OIDC

```bash
EMBEDIQ_AUTH_STRATEGY=oidc \
  EMBEDIQ_OIDC_ISSUER=https://id.example.com/realms/eng \
  EMBEDIQ_OIDC_CLIENT_ID=embediq \
  EMBEDIQ_OIDC_CLIENT_SECRET=… \
  EMBEDIQ_OIDC_ROLES_CLAIM=roles \
  npm run start:web
```

Behavior:

- EmbedIQ validates every `Authorization: Bearer <jwt>` header against
  the IdP's JWKS.
- The `sub` claim becomes the user's `userId`; the `name` / `email`
  claim becomes `displayName`.
- The claim named in `EMBEDIQ_OIDC_ROLES_CLAIM` (default `roles`) is
  parsed as an array of strings — assign `wizard-user` or
  `wizard-admin` here.
- Token expiry + signature validation happens on every request.

### Okta

1. Okta admin → **Applications** → **Create App Integration** →
   **OIDC - Web Application**.
2. Grant type: **Authorization code** + **Refresh token**.
3. Redirect URI: `https://embediq.example.com/callback`
   (your frontend handles the OAuth2 flow — EmbedIQ itself only
   validates bearer tokens; the frontend does the redirect).
4. In **Sign On** → **OpenID Connect ID Token** → **Groups claim
   name** set to `roles`, groups filter `wizard-.*`.
5. Env vars:
   ```
   EMBEDIQ_OIDC_ISSUER=https://<okta-domain>/oauth2/default
   EMBEDIQ_OIDC_CLIENT_ID=<client id>
   EMBEDIQ_OIDC_CLIENT_SECRET=<client secret>
   EMBEDIQ_OIDC_ROLES_CLAIM=roles
   ```

### Auth0

1. Dashboard → **Applications** → **Create Application** →
   **Regular Web Application**.
2. Add `https://embediq.example.com/callback` to Allowed Callback URLs.
3. Create an Auth0 Action that adds a `roles` custom claim from the
   user's authorization assignment:
   ```js
   exports.onExecutePostLogin = async (event, api) => {
     const namespace = 'https://embediq.example.com';
     api.idToken.setCustomClaim(`${namespace}/roles`, event.user.app_metadata?.roles ?? []);
   };
   ```
4. Env vars:
   ```
   EMBEDIQ_OIDC_ISSUER=https://<tenant>.auth0.com/
   EMBEDIQ_OIDC_CLIENT_ID=<client id>
   EMBEDIQ_OIDC_CLIENT_SECRET=<client secret>
   EMBEDIQ_OIDC_ROLES_CLAIM=https://embediq.example.com/roles
   ```

### Azure AD / Entra ID

1. **App registrations** → **New registration** → platform
   **Web**, redirect `https://embediq.example.com/callback`.
2. **App roles** → add `wizard-user` and `wizard-admin` with member
   type **User/Group**.
3. **Token configuration** → add an optional ID-token claim for
   `roles`.
4. Env vars:
   ```
   EMBEDIQ_OIDC_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0
   EMBEDIQ_OIDC_CLIENT_ID=<app registration id>
   EMBEDIQ_OIDC_CLIENT_SECRET=<client secret>
   EMBEDIQ_OIDC_ROLES_CLAIM=roles
   ```

### Keycloak / self-hosted

The generic config works against any compliant OIDC provider. Point
`EMBEDIQ_OIDC_ISSUER` at the realm URL and make sure your client has
a `roles` mapper that emits a string array.

## Strategy 3 — Proxy header

Use when an identity-aware proxy (Google IAP, AWS ALB + Cognito,
Pomerium, Teleport, `oauth2-proxy`, Tailscale ACL-scoped ingress) has
already authenticated the request. The proxy injects the user identity
into two headers, and EmbedIQ simply trusts them.

```bash
EMBEDIQ_AUTH_STRATEGY=proxy \
  EMBEDIQ_PROXY_USER_HEADER=X-Forwarded-User \
  EMBEDIQ_PROXY_ROLES_HEADER=X-EmbedIQ-Roles \
  npm run start:web
```

Behavior:

- `EMBEDIQ_PROXY_USER_HEADER` (default `X-Forwarded-User`) → `userId`.
- `EMBEDIQ_PROXY_ROLES_HEADER` (default `X-EmbedIQ-Roles`) →
  comma-separated roles.
- Requests without the user header are anonymous.

> **Critical:** your network configuration **must** guarantee that
> these headers cannot be forged. If a client can reach EmbedIQ
> directly (bypassing the proxy), they can impersonate any user by
> setting these headers manually. Put EmbedIQ on a non-public port /
> private subnet and only let the proxy reach it.

### Example — Google IAP

Google IAP injects `X-Goog-Authenticated-User-Email` and
`X-Goog-Authenticated-User-Id`. Map to EmbedIQ's expected headers at
the ingress:

```yaml
# ingress-nginx annotation
nginx.ingress.kubernetes.io/configuration-snippet: |
  more_set_input_headers "X-Forwarded-User: $http_x_goog_authenticated_user_email";
```

Roles come from a separate mechanism (IAP groups, Google Workspace
claims). If IAP alone isn't supplying roles, pair with a role mapper
at the proxy level or fall back to one of the other strategies.

### Example — oauth2-proxy

`oauth2-proxy` already sets `X-Forwarded-User` and
`X-Forwarded-Email`. Configure the upstream to forward groups as a
header:

```
--pass-user-headers=true
--set-xauthrequest=true
```

And in EmbedIQ:

```
EMBEDIQ_PROXY_USER_HEADER=X-Forwarded-User
EMBEDIQ_PROXY_ROLES_HEADER=X-Forwarded-Groups
```

Adjust the groups header name to whatever `oauth2-proxy` emits for
your IdP.

## Session ownership without auth

When `EMBEDIQ_AUTH_STRATEGY` is unset and server-side sessions are
enabled, EmbedIQ sets an HMAC-signed HTTP-only cookie
(`embediq_session_owner`) that proves ownership. See
[`session-backends.md`](session-backends.md) for how the cookie is
signed, rotation, and `EMBEDIQ_SESSION_COOKIE_SECRET`.

With auth enabled, ownership is bound to the `userId` and the cookie
becomes unnecessary.

## What happens to unauthenticated requests

| Strategy | Unauthenticated call to `GET /api/domain-packs` | Unauthenticated call to `POST /api/generate` |
|---|---|---|
| none | 200 (open) | 200 (open) |
| basic | 401 `WWW-Authenticate: Basic` | 401 |
| oidc | 401 (no bearer token) | 401 |
| proxy | Request enters anonymously (no user header) | 403 (requires `wizard-admin`) |

## Troubleshooting

- **OIDC returns 401 on every request.** Check `EMBEDIQ_OIDC_ISSUER`
  — it must be the issuer URL from the JWT's `iss` claim, exactly.
  Trailing slash mismatches are the most common cause.
- **Roles claim never matches.** Log the decoded JWT from your IdP
  (without the secret). If the claim is at
  `realm_access.roles` (Keycloak default), set
  `EMBEDIQ_OIDC_ROLES_CLAIM=realm_access.roles` — dotted paths are
  supported.
- **Basic auth prompt appears in the browser every request.** The
  browser isn't caching the credentials. Close and reopen, or use a
  password manager.
- **Proxy-header strategy shows `X-Forwarded-User: foo` logged but
  EmbedIQ says anonymous.** You configured the proxy header but not
  `EMBEDIQ_AUTH_STRATEGY=proxy`. Set the strategy explicitly.
- **`403 Session belongs to a different user`.** The caller's
  authenticated `userId` doesn't match the session's `userId`.
  Sessions are per-user by design — use the admin dump/restore flow
  if you need to hand off ownership.

## See also

- [Session backends](session-backends.md) — session ownership cookies
- [Deployment](deployment.md) — where the reverse proxy sits
- [Security](../../SECURITY.md) — threat model + secret-handling
  guidance
- [Configuration reference](../reference/configuration.md) — every
  `EMBEDIQ_AUTH_*` and `EMBEDIQ_OIDC_*` var
