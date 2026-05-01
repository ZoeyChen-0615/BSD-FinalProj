const STORAGE_KEYS = {
  authSnapshot: "workwise.authSnapshot",
  profile: "workwise.profile",
  userProfiles: "workwise.userProfiles"
};

function getUploadedAtMs(profile) {
  const timestamp = profile?.resume?.uploadedAt ? Date.parse(profile.resume.uploadedAt) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function pickLatestProfile(firstProfile, secondProfile) {
  if (!firstProfile) {
    return secondProfile ?? null;
  }

  if (!secondProfile) {
    return firstProfile;
  }

  return getUploadedAtMs(secondProfile) > getUploadedAtMs(firstProfile)
    ? secondProfile
    : firstProfile;
}

function normalizeUserKeys(clerkUserId, email) {
  return [...new Set([
    clerkUserId?.trim(),
    email?.trim().toLowerCase()
  ].filter(Boolean))];
}

async function mirrorProfileIntoExtensionStorage(profile, clerkUserId, email) {
  const userKeys = normalizeUserKeys(clerkUserId, email);

  chrome.storage.local.get([STORAGE_KEYS.profile, STORAGE_KEYS.userProfiles], (result) => {
    const latestProfile = pickLatestProfile(result?.[STORAGE_KEYS.profile] ?? null, profile);
    const nextUserProfiles = {
      ...(result?.[STORAGE_KEYS.userProfiles] ?? {})
    };

    userKeys.forEach((userKey) => {
      nextUserProfiles[userKey] = pickLatestProfile(nextUserProfiles[userKey] ?? null, profile);
    });

    chrome.storage.local.set({
      [STORAGE_KEYS.profile]: latestProfile,
      [STORAGE_KEYS.userProfiles]: nextUserProfiles
    });
  });
}

function mirrorAuthIntoExtensionStorage(email, signedIn) {
  chrome.storage.local.set({
    [STORAGE_KEYS.authSnapshot]: {
      email: (email || "").trim().toLowerCase(),
      signedIn: Boolean(signedIn),
      source: "account-web",
      syncedAt: new Date().toISOString()
    }
  });
}

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin) {
    return;
  }

  if (event.data?.source !== "workwise-account-web") {
    return;
  }

  if (event.data?.type === "WORKWISE_AUTH_SYNC") {
    const email = event.data?.payload?.email ?? "";
    const signedIn = event.data?.payload?.signedIn ?? false;
    mirrorAuthIntoExtensionStorage(email, signedIn);
    return;
  }

  if (event.data?.type !== "WORKWISE_PROFILE_SYNC") {
    return;
  }

  const profile = event.data?.payload?.profile ?? null;
  const clerkUserId = event.data?.payload?.clerkUserId ?? "";
  const email = event.data?.payload?.email ?? "";

  if (!profile) {
    return;
  }

  mirrorProfileIntoExtensionStorage(profile, clerkUserId, email);
});
