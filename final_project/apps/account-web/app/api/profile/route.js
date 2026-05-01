import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

const SUPABASE_CLERK_JWT_TEMPLATE = "supabase";

class ApiError extends Error {
  constructor(message, status = 500, details = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

function normalizeUrl(url) {
  return (url || "").trim().replace(/\/+$/, "");
}

function buildHeaders({ apiKey, bearerToken, extra = {} }) {
  return {
    apikey: apiKey,
    "Content-Type": "application/json",
    Authorization: `Bearer ${bearerToken}`,
    ...extra
  };
}

async function parseResponse(response) {
  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    const message =
      payload?.msg ||
      payload?.error_description ||
      payload?.error ||
      payload?.message ||
      `Supabase request failed with ${response.status}.`;
    throw new ApiError(message, response.status, payload);
  }

  return payload;
}

async function getSupabaseContext() {
  const { userId, getToken } = await auth();
  if (!userId) {
    throw new ApiError("Not signed in.", 401);
  }

  const supabaseUrl = normalizeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!supabaseUrl) {
    throw new ApiError("Missing NEXT_PUBLIC_SUPABASE_URL.", 500);
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (serviceRoleKey) {
    return {
      apiKey: serviceRoleKey,
      bearerToken: serviceRoleKey,
      userId,
      supabaseUrl
    };
  }

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!anonKey) {
    throw new ApiError("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.", 500);
  }

  const token = await getToken({ template: SUPABASE_CLERK_JWT_TEMPLATE }).catch(() => null);
  if (!token) {
    throw new ApiError(
      'Missing Clerk JWT template "supabase". Add it in Clerk -> JWT Templates, or set SUPABASE_SERVICE_ROLE_KEY in Vercel.'
    );
  }

  return {
    apiKey: anonKey,
    bearerToken: token,
    userId,
    supabaseUrl
  };
}

function buildErrorResponse(error, requestLabel, context = {}) {
  const status = error instanceof ApiError ? error.status : 500;
  const message = error?.message || "Unexpected server error.";

  console.error(`[api/profile] ${requestLabel} failed`, {
    message,
    status,
    details: error instanceof ApiError ? error.details : null,
    context,
    stack: error?.stack
  });

  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try {
    const { apiKey, bearerToken, userId, supabaseUrl } = await getSupabaseContext();
    const response = await fetch(
      `${supabaseUrl}/rest/v1/profiles?clerk_user_id=eq.${encodeURIComponent(userId)}&select=profile_json`,
      {
        method: "GET",
        headers: buildHeaders({ apiKey, bearerToken })
      }
    );

    const rows = await parseResponse(response);
    return NextResponse.json({ profile: rows?.[0]?.profile_json ?? null });
  } catch (error) {
    return buildErrorResponse(error, "GET", {
      hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      hasAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
    });
  }
}

export async function POST(request) {
  try {
    const { apiKey, bearerToken, userId, supabaseUrl } = await getSupabaseContext();
    const body = await request.json();
    const profile = body?.profile ?? null;
    const email = body?.email ?? null;

    if (!profile) {
      return NextResponse.json({ error: "Missing profile payload." }, { status: 400 });
    }

    const response = await fetch(
      `${supabaseUrl}/rest/v1/profiles?on_conflict=clerk_user_id`,
      {
        method: "POST",
        headers: buildHeaders({
          apiKey,
          bearerToken,
          extra: {
            Prefer: "resolution=merge-duplicates,return=representation"
          }
        }),
        body: JSON.stringify([
          {
            clerk_user_id: userId,
            email,
            profile_json: profile
          }
        ])
      }
    );

    const rows = await parseResponse(response);
    return NextResponse.json({ profile: rows?.[0]?.profile_json ?? profile });
  } catch (error) {
    return buildErrorResponse(error, "POST", {
      hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      hasAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
    });
  }
}
