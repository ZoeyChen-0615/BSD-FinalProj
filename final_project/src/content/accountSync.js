const STORAGE_KEYS = {
  authSnapshot: "workwise.authSnapshot",
  profile: "workwise.profile",
  userProfiles: "workwise.userProfiles",
  favoriteCompanies: "workwise.favoriteCompanies",
  userFavoriteCompanies: "workwise.userFavoriteCompanies"
};

function getAuthSnapshotMs(snapshot) {
  const timestamp = snapshot?.syncedAt ? Date.parse(snapshot.syncedAt) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function pickLatestAuthSnapshot(firstSnapshot, secondSnapshot) {
  if (!firstSnapshot) {
    return secondSnapshot ?? null;
  }

  if (!secondSnapshot) {
    return firstSnapshot;
  }

  return getAuthSnapshotMs(secondSnapshot) > getAuthSnapshotMs(firstSnapshot)
    ? secondSnapshot
    : firstSnapshot;
}

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
  const favoriteCompanies = Array.isArray(profile?.favoriteCompanies) ? profile.favoriteCompanies : [];

  chrome.storage.local.get(
    [STORAGE_KEYS.profile, STORAGE_KEYS.userProfiles, STORAGE_KEYS.favoriteCompanies, STORAGE_KEYS.userFavoriteCompanies],
    (result) => {
    const latestProfile = pickLatestProfile(result?.[STORAGE_KEYS.profile] ?? null, profile);
    const nextUserProfiles = {
      ...(result?.[STORAGE_KEYS.userProfiles] ?? {})
    };
    const nextUserFavoriteCompanies = {
      ...(result?.[STORAGE_KEYS.userFavoriteCompanies] ?? {})
    };

    userKeys.forEach((userKey) => {
      nextUserProfiles[userKey] = pickLatestProfile(nextUserProfiles[userKey] ?? null, profile);
      nextUserFavoriteCompanies[userKey] = favoriteCompanies;
    });

    chrome.storage.local.set({
      [STORAGE_KEYS.profile]: latestProfile,
      [STORAGE_KEYS.userProfiles]: nextUserProfiles,
      [STORAGE_KEYS.favoriteCompanies]: favoriteCompanies,
      [STORAGE_KEYS.userFavoriteCompanies]: nextUserFavoriteCompanies
    });
  }
  );
}

function mirrorAuthIntoExtensionStorage(email, signedIn, syncedAt) {
  const nextSnapshot = {
    email: (email || "").trim().toLowerCase(),
    signedIn: Boolean(signedIn),
    source: "account-web",
    syncedAt: syncedAt || new Date().toISOString()
  };

  chrome.storage.local.get([STORAGE_KEYS.authSnapshot], (result) => {
    const latestSnapshot = pickLatestAuthSnapshot(result?.[STORAGE_KEYS.authSnapshot] ?? null, nextSnapshot);
    chrome.storage.local.set({
      [STORAGE_KEYS.authSnapshot]: latestSnapshot
    });
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
    const syncedAt = event.data?.payload?.syncedAt ?? "";
    mirrorAuthIntoExtensionStorage(email, signedIn, syncedAt);
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
