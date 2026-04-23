const STORAGE_KEYS = {
  profile: "workwise.profile",
  currentAnalysis: "workwise.currentAnalysis",
  detectedJob: "workwise.detectedJob"
};

function getLocal(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => resolve(result));
  });
}

function setLocal(values) {
  return new Promise((resolve) => {
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

export { STORAGE_KEYS };
