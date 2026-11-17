# Invite-only login: Microsoft (Neram work account) and Google one-tap

Paste everything under "Prompt" into a Claude Code session opened in this repo.
The "Owner steps" at the end are for you (Hari), not for Claude.

---

## Prompt

You are working in the Aesta Management App repo. Read CLAUDE.md first and follow it
(apply migrations to prod only with my confirmation, check UI with Playwright via
/dev-login, the MUI hydration rules). Do not deploy or push.

### Goal

People find the current login emails (like ajithkumar@nerasmclasses.onmicrosoft.com)
hard to type. Aesta will move to:

- "Continue with Microsoft" for people who already have a Neram work account. They
  use the same account they sign in to Neram Admin with, and only accounts from the
  Neram Microsoft tenant are accepted;
- "Continue with Google" for everyone else;
- email and password kept as a backup;
- invite only: a person gets in only if an admin added them. A stranger who taps
  "Continue with Google" must never get in;
- a design that still works when Aesta is later offered to other construction companies.
  Access therefore depends on belonging to a company (`company_members`), not only on
  having an account.

Existing people keep their accounts. Only their login email changes, so their user id,
sites, tasks and the Neram task hub link stay the same.

Who signs in how:

| Person | Today's Aesta login | New Aesta login email | Button |
|---|---|---|---|
| Hari Babu | haribabu@nerasmclasses.onmicrosoft.com | haribabu@neramclasses.com | Microsoft |
| Shanthi | shanthimano@nerasmclasses.onmicrosoft.com | shanthimano@neramclasses.com | Microsoft |
| Tamil Selvan | tamilselvan@nerasmclasses.onmicrosoft.com | tamilselvan@neramclasses.com | Microsoft |
| Ajith Kumar | ajithkumar@nerasmclasses.onmicrosoft.com | his own Gmail (Hari will give it) | Google |

The three @neramclasses.com addresses are the emails of their Microsoft work accounts,
the same ones Neram Admin uses. The Aesta email must match the email Microsoft sends,
or Supabase cannot link the Microsoft login to the existing Aesta account.

### What is true today (checked; confirm before changing)

- `src/lib/supabase/middleware.ts` (about lines 35 to 97) only checks that someone is
  signed in. It never reads `public.users`, so a sign-in with no `users` row, or with
  `status` inactive or suspended, still gets in.
- `src/contexts/AuthContext.tsx` (about lines 40 to 77) logs "No profile row for auth
  user" and carries on.
- `src/app/api/admin/users/route.ts`:
  - `verifyAdminAccess` (about lines 40 to 56) lets every signed-in user through.
  - POST creates the auth user with a password and a `users` row, but no
    `company_members` row.
- `/register-company` lets any signed-in user create a company and become its owner.
- `src/app/api/dev-ensure-password/route.ts` has a real email and password written in
  the code.
- `/forgot-password` and `/reset-password` are not in `isPublicRoute`, so a signed-out
  person is sent to /login.
- There is no `/auth/callback` route and no `signInWithOAuth` anywhere.
- Tables `companies`, `company_members` and `company_invites` exist; they were made in
  Studio, not in migrations. `users` has no `company_id`.
- The app reaches Supabase through the proxy aesta-supabase-proxy.aestabuilders.workers.dev.

### The design: two locks

1. **Supabase lock.** I will turn off "Allow new users to sign up" in the hosted
   project. Only the service role (admin API) can then create accounts, so a Google
   sign-in from an unknown email is refused by Supabase itself.
2. **App lock.** One function, `hasAccess`, decides who may use Aesta: a `users` row
   for this auth id, with `status = 'active'`, and at least one `company_members` row.
   It runs on every request, so even if the Supabase setting is ever switched back on
   by mistake, a stranger still gets nowhere.

Inviting a person pre-creates their account, so no invite email is needed. When they
first tap "Continue with Microsoft" or "Continue with Google", Supabase links that
login to the existing account because the verified emails match.

The Microsoft button accepts only the Neram tenant: the Supabase Azure provider's
tenant URL is set to the Neram tenant. When other companies join later, this becomes
a multi-tenant app and the app lock (company membership) decides who gets in.

### Do this in order. Stop after each phase and show me what changed.

**Phase 0. Close the holes first.**

a. `verifyAdminAccess`: require a `users` row with `role = 'admin'` and
   `status = 'active'` for the signed-in auth user. Anyone else gets 403.
b. `/api/dev-ensure-password`: remove the hardcoded email and password. If the route is
   still needed, read both from server env vars and refuse unless
   NEXT_PUBLIC_ENABLE_DEV_LOGIN is true AND NODE_ENV is not production. Tell me plainly
   which account's password was in the code, so I can change it.
c. `/register-company`: only an admin may open it (server-side check, not only a hidden
   link). Later, new companies will be created only by the platform owner.
d. Add `/forgot-password`, `/reset-password`, `/auth/callback` and `/no-access` to
   `isPublicRoute`.

**Phase 1. The access check.**

- New `src/lib/auth/access.ts` with
  `hasAccess(supabase, authUserId): Promise<{ ok: true, userId, companyIds } | { ok: false, reason: 'no_profile' | 'inactive' | 'no_company' }>`.
  Use one query: `users` by `auth_id` (id, status) plus its `company_members` rows.
- Middleware: after `getUser()`, call `hasAccess`.
  - A refused page request: sign out (clear the session cookies) and redirect to
    `/no-access?reason=...`.
  - A refused `/api/*` request: 403 JSON `{ error, code: 'no_access' }`.
  - Keep it to one small query per request. If it is measurably slow, cache the yes
    answer for 5 minutes in a signed, httpOnly cookie tied to the auth user id, and
    never cache a no.
- `AuthContext`: when the profile is missing or not active, sign out and go to
  `/no-access`, instead of logging and carrying on.
- New page `/no-access`, in plain words:
  - Title: "You don't have access to Aesta yet"
  - Body: "This account (<email>) has not been added. Ask your company admin to add you,
    then try again."
  - Buttons: "Use a different account" (back to /login) and "Sign out".
  - Show the email only when we know it; never show the reason code to the person.
- Backfill: write a migration that adds a `company_members` row (the one existing
  company, role from `users.role`) for every active `users` row that has none. Show me
  the count on prod (read only) before I confirm applying it. Without this step,
  Phase 1 would lock everyone out.

**Phase 2. Microsoft and Google sign-in.**

- Run ui-ux-pro-max before touching the login page.
- New route handler `src/app/auth/callback/route.ts`:
  1. Read `code` and `next` from the URL.
  2. Call `exchangeCodeForSession(code)` with the server client.
  3. Call `hasAccess`. If refused, sign out and redirect to `/no-access`.
  4. Otherwise update `users.last_login_at` and redirect to `next`. Allow only a
     same-site path starting with `/`; fall back to `/site/dashboard`.
- Login page:
  - Two buttons of equal size at the top. Each follows its brand's sign-in button
    rules and uses the official logo as SVG:
    1. "Continue with Microsoft": calls
       `signInWithOAuth({ provider: 'azure', options: { scopes: 'email', redirectTo: origin + '/auth/callback?next=...' } })`.
    2. "Continue with Google": calls
       `signInWithOAuth({ provider: 'google', options: { redirectTo: origin + '/auth/callback?next=...' } })`.
  - Remember which button was used last on this device (localStorage) and show it
    first next time.
  - Below them, a divider "or", then the existing email and password form, collapsed
    behind "Sign in with password" on phones.
  - Keep the existing lockout and error messages. Add messages for OAuth errors coming
    back in the URL:
    - "Signups not allowed" becomes "This account has not been added to Aesta. Ask your
      company admin."
    - A Microsoft account from another organisation becomes "Use your Neram work
      account, or ask your company admin."
  - Touch targets at least 44px, visible focus, works at 375px.
- Microsoft email check: Supabase links accounts only on a verified email. Confirm that
  the Azure provider returns the email, and tell me if the app registration needs the
  optional claims `email` and `xms_edov` on the ID token (see the Supabase Azure docs).
- Check that the OAuth round trip works through the Supabase proxy. Log the
  `redirect_uri` Supabase sends to Google and tell me the exact value, because I must
  register that same value in Google Cloud.

**Phase 3. Inviting people and changing a login email (Settings > Users, admin only).**

- "Invite person" dialog: Gmail (or any email), name, role, sites, and an optional
  password ("Leave empty if they will use Continue with Google").
- `POST /api/admin/users` creates, in order:
  1. the auth user (`email_confirm: true`, the password only if given);
  2. the `users` row;
  3. the `company_members` row for the admin's current company.

  If any step fails, undo the earlier ones. Refuse an email that already exists, with a
  clear message.
- On each row, "Change login email" (admin only):
  - Calls `auth.admin.updateUserById(auth_id, { email, email_confirm: true })` and
    updates `users.email`.
  - Says plainly: "They will sign in with the new email from now on. Their data stays
    the same."
  - Refuses an email already used by another account.
- Turning a person off sets `users.status = 'inactive'`. They are signed out on their
  next page load because of the Phase 1 check. Never delete auth users from the UI.

**Phase 4. Tests.**

- Vitest:
  - `hasAccess` for each case: no profile, inactive, suspended, no company, ok.
  - The `next` redirect guard: rejects `//evil.com`, `https://...` and `/\evil`.
  - `verifyAdminAccess`.
- Playwright (Supabase mocked):
  - the login page at 375 and 1280;
  - `/no-access`;
  - the invite dialog and "Change login email";
  - a refused API call returning 403.
- Manual check that I will run with you on a Supabase branch or staging, with sign-ups
  off:
  - a Neram work account (after its Aesta email was changed) signs in with Microsoft
    and lands on the same `users.id` as before;
  - an invited Gmail signs in with Google and lands on the same `users.id` as before;
  - an un-invited Gmail and a Microsoft account from another organisation are both
    refused, and no new row appears in Authentication > Users;
  - a suspended user is signed out on the next page.

When done, list:

- every file changed;
- the migration (not applied to prod without my yes);
- the exact redirect URI to register with Google and with Microsoft;
- the Supabase dashboard settings I must change.

---

## Owner steps (for Hari; Claude cannot do these)

Do steps 1 to 3 before the buttons go live. Turning off sign-ups first means a button
can never let a stranger in.

### 1. Supabase dashboard (Aesta project), first

- Authentication > Sign In / Providers > "Allow new users to sign up": turn **off**.
  Admin-created accounts still work.
- Authentication > URL Configuration:
  - Site URL: `https://app.aesta.co.in`
  - Redirect URLs: add `https://app.aesta.co.in/auth/callback` and your Vercel preview
    pattern, for example `https://*-<team>.vercel.app/auth/callback`.

### 2. Google Cloud Console

1. Create (or pick) a project, for example "Aesta".
2. APIs & Services > OAuth consent screen:
   - App name: Aesta
   - Support email: yours
   - User type: External
   - Publishing status: **In production**. In "Testing" mode only listed test users
     can sign in.
3. APIs & Services > Credentials > Create credentials > OAuth client ID:
   - Type: Web application
   - Authorised JavaScript origins: `https://app.aesta.co.in`
   - Authorised redirect URIs: `https://ocutbpoaibjxtyjkrnda.supabase.co/auth/v1/callback`
     (and, if Claude reports a different value in Phase 2 because of the proxy, add that
     one too)
4. Copy the Client ID and Client secret into Supabase > Authentication >
   Sign In / Providers > Google, and turn Google on.

### 3. Microsoft Entra admin center (Neram tenant)

1. Identity > Applications > App registrations > New registration:
   - Name: Aesta
   - Supported account types: "Accounts in this organizational directory only"
     (single tenant)
   - Redirect URI (Web): `https://ocutbpoaibjxtyjkrnda.supabase.co/auth/v1/callback`
     (and the proxy value too, if Claude reports a different one)
2. Certificates & secrets > New client secret. Copy the value at once; it is shown
   only one time.
3. Token configuration > Add optional claim > ID token: tick `email` (and `xms_edov`
   if Claude says it is needed).
4. Overview: copy the Application (client) ID and the Directory (tenant) ID.
5. In Supabase > Authentication > Sign In / Providers > Azure:
   - Client ID and Secret: paste them.
   - Azure Tenant URL: `https://login.microsoftonline.com/<Directory (tenant) ID>`.
     This keeps out every Microsoft account that is not Neram's.
   - Turn Azure on.

Use a new app registration, not the one Neram Admin uses, so the two can be changed
or removed separately.

### 4. After the code is deployed

1. In Aesta > Settings > Users, use "Change login email":
   - Hari Babu: `haribabu@neramclasses.com`
   - Shanthi: `shanthimano@neramclasses.com`
   - Tamil Selvan: `tamilselvan@neramclasses.com`
   - Ajith Kumar: his own Gmail
2. Hari, Shanthi and Tamil tap "Continue with Microsoft" once. Ajith taps "Continue
   with Google" once. They stay signed in after that.
3. Try a Gmail that was never added, and a Microsoft account from outside Neram. Both
   must be refused.
