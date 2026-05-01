function normalizeUrl(url) {
  return (url || "").trim().replace(/\/+$/, "");
}

export const SUPABASE_CLERK_JWT_TEMPLATE = "supabase";

function buildHeaders(token, extra = {}) {
  return {
    apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
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

export async function getSupabaseToken(getToken) {
  const token = await getToken({ template: SUPABASE_CLERK_JWT_TEMPLATE }).catch(() => null);
  if (!token) {
    throw new Error('Missing Clerk JWT template "supabase". Add it in Clerk -> JWT Templates.');
  }

  return token;
}

export async function loadRemoteProfile({ token, clerkUserId }) {
  const response = await fetch(
    `${normalizeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)}/rest/v1/profiles?clerk_user_id=eq.${encodeURIComponent(clerkUserId)}&select=profile_json`,
    {
      method: "GET",
      headers: buildHeaders(token)
    }
  );

  const rows = await parseResponse(response);
  return rows?.[0]?.profile_json ?? null;
}

export async function saveRemoteProfile({ token, clerkUserId, email, profile }) {
  const response = await fetch(
    `${normalizeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)}/rest/v1/profiles?on_conflict=clerk_user_id`,
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
