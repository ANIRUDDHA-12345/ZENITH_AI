const CONVERSATIONS_KEY = 'zenith.conversations.v1';
const PREFERENCES_KEY = 'zenith.preferences.v1';
const MEDIA_DATABASE = 'zenith.media.v1';
const MEDIA_STORE = 'media';
let mediaDatabase;

export function readConversations() {
  try {
    const value = JSON.parse(localStorage.getItem(CONVERSATIONS_KEY) ?? '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function writeConversations(conversations) {
  localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
}

export function readPreferences() {
  try {
    return { theme: 'dark', instructions: '', ...JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}') };
  } catch {
    return { theme: 'dark', instructions: '' };
  }
}

export function writePreferences(preferences) {
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
}

function openMediaDatabase() {
  if (!mediaDatabase) {
    mediaDatabase = new Promise((resolve, reject) => {
      const request = indexedDB.open(MEDIA_DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(MEDIA_STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Could not open local image storage.'));
    }).catch((error) => {
      mediaDatabase = undefined;
      throw error;
    });
  }
  return mediaDatabase;
}

export async function saveMedia(blob) {
  const database = await openMediaDatabase();
  const id = crypto.randomUUID();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(MEDIA_STORE, 'readwrite');
    transaction.objectStore(MEDIA_STORE).put(blob, id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save an image locally.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Could not save an image locally.'));
  });
  return id;
}

export async function readMedia(id) {
  const database = await openMediaDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(MEDIA_STORE, 'readonly').objectStore(MEDIA_STORE).get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error ?? new Error('Could not read an image from local storage.'));
  });
}

export async function readMediaDataUrl(id) {
  const blob = await readMedia(id);
  if (!blob) throw new Error('An attached image is no longer available in this browser.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error ?? new Error('Could not prepare an image for upload.'));
    reader.readAsDataURL(blob);
  });
}

export async function deleteMedia(id) {
  const database = await openMediaDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(MEDIA_STORE, 'readwrite');
    transaction.objectStore(MEDIA_STORE).delete(id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not remove a local image.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Could not remove a local image.'));
  });
}
