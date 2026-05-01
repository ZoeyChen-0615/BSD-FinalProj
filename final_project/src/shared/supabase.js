import { SUPABASE_ANON_KEY, SUPABASE_PROJECT_URL } from "./cloudConfig.js";

function normalizeUrl(url) {
  return (url || "").trim().replace(/\/+$/, "");
}

function buildHeaders(token, extra = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...extra
  };
}

async function parseResponse(response) {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      payload?.msg ||
      payload?.error_description ||
      payload?.error ||
      payload?.message ||
      "Supabase request failed.";
    throw new Error(message);
  }

  return payload;
}

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_PROJECT_URL && SUPABASE_ANON_KEY);
}

export async function loadRemoteProfile({ token, clerkUserId }) {
  if (!token || !clerkUserId) {
    return null;
  }

  const response = await fetch(
    `${normalizeUrl(SUPABASE_PROJECT_URL)}/rest/v1/profiles?clerk_user_id=eq.${encodeURIComponent(clerkUserId)}&select=profile_json`,
    {
      method: "GET",
      headers: buildHeaders(token)
    }
  );

  const rows = await parseResponse(response);
  return rows?.[0]?.profile_json ?? null;
}

export async function saveRemoteProfile({ token, clerkUserId, email, profile }) {
  if (!token || !clerkUserId) {
    throw new Error("No signed-in Clerk user found for profile sync.");
  }

  const response = await fetch(
    `${normalizeUrl(SUPABASE_PROJECT_URL)}/rest/v1/profiles?on_conflict=clerk_user_id`,
    {
      method: "POST",
      headers: buildHeaders(token, {
        Prefer: "resolution=merge-duplicates,return=representation"
      }),
      body: JSON.stringify([
        {
          clerk_user_id: clerkUserId,
          email: email || null,
          profile_json: profile
        }
      ])
    }
  );

  const rows = await parseResponse(response);
  return rows?.[0]?.profile_json ?? profile;
}
