import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Route guards used to call getUser() (a server round-trip) on every
// navigation. We still verify the token with the server, but remember a
// successful check for this exact access token for a short window.
// Data access stays protected server-side by RLS regardless.
const VERIFY_TTL_MS = 60_000;
let verified: { token: string; user: User; at: number } | null = null;

export function markSessionVerified(token: string, user: User) {
  verified = { token, user, at: Date.now() };
}

export function clearVerifiedSession() {
  verified = null;
}

export async function getVerifiedUser(): Promise<User | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    verified = null;
    return null;
  }
  if (verified && verified.token === session.access_token && Date.now() - verified.at < VERIFY_TTL_MS) {
    return verified.user;
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    verified = null;
    return null;
  }
  markSessionVerified(session.access_token, user);
  return user;
}

export function isVerificationFresh(token: string, now = Date.now()) {
  return !!verified && verified.token === token && now - verified.at < VERIFY_TTL_MS;
}
