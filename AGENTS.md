<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- TypeScript uses `strict` but not `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature` or `noImplicitReturns` — those flags produced dozens of non-runtime errors that blocked the preview build.
- Password-reset UI must never reveal whether an email has an account (anti-enumeration), but must surface real send failures such as rate limits.
- Stale page-file load errors ("Failed to fetch dynamically imported module") trigger one guarded auto-reload via src/lib/chunk-reload.ts from the root route; why: rebuilds/redeploys invalidate old file links in open tabs.
- The /_authenticated guard verifies the user via src/lib/auth-guard.ts, which caches a successful server check per access token for 60s; why: getUser() on every navigation added a network round-trip to each page change.
