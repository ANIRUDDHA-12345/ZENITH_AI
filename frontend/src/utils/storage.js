const CONVERSATIONS_KEY = 'zenith.conversations.v1';
const PREFERENCES_KEY = 'zenith.preferences.v1';

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
