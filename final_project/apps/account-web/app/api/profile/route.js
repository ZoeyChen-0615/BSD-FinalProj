import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";

const SUPABASE_TEMPLATE = "supabase";

function normalizeUrl(url) {
  return (url || "").trim().replace(/\/+$/, "");
}

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
      `Supabase request failed with ${response.status}.`;
    throw new Error(message);
  }

  return payload;
}

async function getSupabaseContext() {
  const { userId, getToken } = await auth();
  if (!userId) {
    throw new Error("Not signed in.");
  }

  const token = await getToken({ template: SUPABASE_TEMPLATE }).catch(() => null);
  if (!token) {
    throw new Error('Missing Clerk JWT template "supabase".');
  }

  return { userId, token };
}

export async function GET() {
  try {
    const { userId, token } = await getSupabaseContext();
    const response = await fetch(
      `${normalizeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)}/rest/v1/profiles?clerk_user_id=eq.${encodeURIComponent(userId)}&select=profile_json`,
      {
        method: "GET",
        headers: buildHeaders(token)
      }
    );

    const rows = await parseResponse(response);
    return NextResponse.json({ profile: rows?.[0]?.profile_json ?? null });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Could not load profile." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const { userId, token } = await getSupabaseContext();
    const user = await currentUser();
    const body = await request.json();
    const profile = body?.profile ?? null;

    if (!profile) {
      return NextResponse.json({ error: "Missing profile payload." }, { status: 400 });
    }

    const response = await fetch(
      `${normalizeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)}/rest/v1/profiles?on_conflict=clerk_user_id`,
      {
        method: "POST",
        headers: buildHeaders(token, {
          Prefer: "resolution=merge-duplicates,return=representation"
        }),
        body: JSON.stringify([
          {
            clerk_user_id: userId,
            email: user?.primaryEmailAddress?.emailAddress ?? null,
            profile_json: profile
          }
        ])
      }
    );

    const rows = await parseResponse(response);
    return NextResponse.json({ profile: rows?.[0]?.profile_json ?? profile });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Could not save profile." },
      { status: 500 }
    );
  }
}
