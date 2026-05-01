import { createClerkClient } from "@clerk/chrome-extension/client";
import { CLERK_PUBLISHABLE_KEY } from "./cloudConfig.js";

let clerkClientPromise = null;

function getPrimaryEmail(user) {
  return (
    user?.primaryEmailAddress?.emailAddress ||
    user?.emailAddresses?.[0]?.emailAddress ||
    user?.emailAddress ||
    ""
  );
}

function formatClerkError(error) {
  if (!error) {
    return "Clerk request failed.";
  }

  if (typeof error === "string") {
    return error;
  }

  if (Array.isArray(error?.errors) && error.errors.length) {
    return error.errors
      .map((item) => item.longMessage || item.message)
      .filter(Boolean)
      .join(" ");
  }

  return error.message || "Clerk request failed.";
}

function buildAuthState(clerk) {
  return {
    user: clerk?.user ?? null,
    session: clerk?.session ?? null,
    email: getPrimaryEmail(clerk?.user)
  };
}

async function activateCompletedSession(clerk, createdSessionId) {
  if (createdSessionId) {
    await clerk.setActive({ session: createdSessionId });
  }

  return buildAuthState(clerk);
}

export function getClerkEmail(user) {
  return getPrimaryEmail(user);
}

export async function getClerkClient() {
  if (!clerkClientPromise) {
    const clerk = createClerkClient({ publishableKey: CLERK_PUBLISHABLE_KEY });
    clerkClientPromise = clerk.load().then(() => clerk);
  }

  return clerkClientPromise;
}

export async function getClerkAuthState() {
  const clerk = await getClerkClient();
  return buildAuthState(clerk);
}

export async function getClerkSessionToken() {
  const clerk = await getClerkClient();
  if (!clerk.session) {
    return null;
  }

  return clerk.session.getToken({ template: "supabase" }).catch(() => clerk.session?.getToken() ?? null);
}

export async function signInWithClerk(credentials) {
  const clerk = await getClerkClient();
  const signIn = clerk.client?.signIn;

  if (!signIn) {
    throw new Error("Clerk sign-in is unavailable.");
  }

  const { error } = await signIn.create({
    identifier: credentials.email,
    password: credentials.password
  });

  if (error) {
    throw new Error(formatClerkError(error));
  }

  if (signIn.status === "complete") {
    return {
      ...(await activateCompletedSession(clerk, signIn.createdSessionId)),
      pending: false,
      status: signIn.status
    };
  }

  return {
    ...buildAuthState(clerk),
    pending: true,
    status: signIn.status
  };
}

export async function signUpWithClerk(credentials) {
  const clerk = await getClerkClient();
  const signUp = clerk.client?.signUp;

  if (!signUp) {
    throw new Error("Clerk sign-up is unavailable.");
  }

  const { error } = await signUp.create({
    emailAddress: credentials.email,
    password: credentials.password
  });

  if (error) {
    throw new Error(formatClerkError(error));
  }

  if (signUp.status === "complete") {
    return {
      ...(await activateCompletedSession(clerk, signUp.createdSessionId)),
      pending: false,
      status: signUp.status
    };
  }

  return {
    ...buildAuthState(clerk),
    pending: true,
    status: signUp.status
  };
}

export async function signOutFromClerk() {
  const clerk = await getClerkClient();
  await clerk.signOut();
  return buildAuthState(clerk);
}
