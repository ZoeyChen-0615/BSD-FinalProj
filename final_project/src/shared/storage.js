const STORAGE_KEYS = {
  profile: "workwise.profile",
  currentAnalysis: "workwise.currentAnalysis",
  detectedJob: "workwise.detectedJob",
  authSnapshot: "workwise.authSnapshot",
  favoriteCompanies: "workwise.favoriteCompanies",
  userProfiles: "workwise.userProfiles",
  userFavoriteCompanies: "workwise.userFavoriteCompanies"
};

function loadLocalMirror(key) {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLocalMirror(key, value) {
  try {
    if (!globalThis.localStorage) {
      return;
    }

    if (value === null || value === undefined) {
      globalThis.localStorage.removeItem(key);
      return;
    }

    globalThis.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore localStorage mirror failures and keep chrome.storage.local as primary.
  }
}

function getUploadedAtMs(value) {
  const timestamp = value?.resume?.uploadedAt ? Date.parse(value.resume.uploadedAt) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getFavoriteSavedAtMs(value) {
  if (!Array.isArray(value) || !value.length) {
    return 0;
  }

  return value.reduce((latest, company) => {
    const timestamp = company?.savedAt ? Date.parse(company.savedAt) : Number.NaN;
    return Number.isFinite(timestamp) && timestamp > latest ? timestamp : latest;
  }, 0);
}

function mergeUserProfiles(storedProfiles, mirroredProfiles) {
  const merged = { ...(storedProfiles ?? {}) };

  Object.entries(mirroredProfiles ?? {}).forEach(([userKey, mirroredProfile]) => {
    const storedProfile = merged[userKey] ?? null;
    if (!storedProfile || getUploadedAtMs(mirroredProfile) > getUploadedAtMs(storedProfile)) {
      merged[userKey] = mirroredProfile;
    }
  });

  return Object.keys(merged).length ? merged : null;
}

function mergeUserFavoriteCompanies(storedFavorites, mirroredFavorites) {
  const merged = { ...(storedFavorites ?? {}) };

  Object.entries(mirroredFavorites ?? {}).forEach(([userKey, mirroredCompanies]) => {
    const storedCompanies = merged[userKey] ?? [];
    if (
      !storedCompanies.length ||
      getFavoriteSavedAtMs(mirroredCompanies) > getFavoriteSavedAtMs(storedCompanies)
    ) {
      merged[userKey] = mirroredCompanies;
    }
  });

  return Object.keys(merged).length ? merged : null;
}

function pickLatestValue(key, storedValue, mirroredValue) {
  if (key === STORAGE_KEYS.userProfiles) {
    return mergeUserProfiles(storedValue, mirroredValue);
  }

  if (key === STORAGE_KEYS.userFavoriteCompanies) {
    return mergeUserFavoriteCompanies(storedValue, mirroredValue);
  }

  if (key !== STORAGE_KEYS.profile) {
    return storedValue ?? mirroredValue ?? null;
  }

  if (!storedValue) {
    return mirroredValue ?? null;
  }

  if (!mirroredValue) {
    return storedValue;
  }

  return getUploadedAtMs(mirroredValue) > getUploadedAtMs(storedValue)
    ? mirroredValue
    : storedValue;
}

function getLocal(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      const mergedResult = { ...result };
      keys.forEach((key) => {
        mergedResult[key] = pickLatestValue(key, result?.[key] ?? null, loadLocalMirror(key));
      });
      resolve(mergedResult);
    });
  });
}

function setLocal(values) {
  return new Promise((resolve) => {
    Object.entries(values).forEach(([key, value]) => saveLocalMirror(key, value));
    chrome.storage.local.set(values, () => resolve());
  });
}

export async function loadProfile() {
  const result = await getLocal([STORAGE_KEYS.profile]);
  return result[STORAGE_KEYS.profile] ?? null;
}

export async function saveProfile(profile) {
  await setLocal({ [STORAGE_KEYS.profile]: profile });
}

export async function loadCurrentAnalysis() {
  const result = await getLocal([STORAGE_KEYS.currentAnalysis]);
  return result[STORAGE_KEYS.currentAnalysis] ?? null;
}

export async function saveCurrentAnalysis(analysis) {
  await setLocal({ [STORAGE_KEYS.currentAnalysis]: analysis });
}

export async function loadDetectedJob() {
  const result = await getLocal([STORAGE_KEYS.detectedJob]);
  return result[STORAGE_KEYS.detectedJob] ?? null;
}

export async function loadAuthSnapshot() {
  const result = await getLocal([STORAGE_KEYS.authSnapshot]);
  return result[STORAGE_KEYS.authSnapshot] ?? null;
}

export async function saveAuthSnapshot(snapshot) {
  await setLocal({ [STORAGE_KEYS.authSnapshot]: snapshot });
}

export async function loadFavoriteCompanies() {
  const result = await getLocal([STORAGE_KEYS.favoriteCompanies]);
  return result[STORAGE_KEYS.favoriteCompanies] ?? [];
}

export async function saveFavoriteCompanies(favoriteCompanies) {
  await setLocal({ [STORAGE_KEYS.favoriteCompanies]: favoriteCompanies });
}

export async function loadUserProfile(userKey) {
  if (!userKey) {
    return null;
  }

  const result = await getLocal([STORAGE_KEYS.userProfiles]);
  return result[STORAGE_KEYS.userProfiles]?.[userKey] ?? null;
}

export async function saveUserProfile(userKey, profile) {
  if (!userKey) {
    return;
  }

  const result = await getLocal([STORAGE_KEYS.userProfiles]);
  const nextProfiles = {
    ...(result[STORAGE_KEYS.userProfiles] ?? {}),
    [userKey]: profile
  };
  await setLocal({ [STORAGE_KEYS.userProfiles]: nextProfiles });
}

export async function loadUserFavoriteCompanies(userKey) {
  if (!userKey) {
    return [];
  }

  const result = await getLocal([STORAGE_KEYS.userFavoriteCompanies]);
  return result[STORAGE_KEYS.userFavoriteCompanies]?.[userKey] ?? [];
}

export async function saveUserFavoriteCompanies(userKey, favoriteCompanies) {
  if (!userKey) {
    return;
  }

  const result = await getLocal([STORAGE_KEYS.userFavoriteCompanies]);
  const nextFavorites = {
    ...(result[STORAGE_KEYS.userFavoriteCompanies] ?? {}),
    [userKey]: favoriteCompanies
  };
  await setLocal({ [STORAGE_KEYS.userFavoriteCompanies]: nextFavorites });
}

export { STORAGE_KEYS };
