const defaultApiBaseUrl = import.meta.env.PROD
  ? 'https://zenith-ai-api-x9c8.onrender.com'
  : '';
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || defaultApiBaseUrl).replace(/\/+$/, '');

export async function streamChat(messages, { signal, onText }) {
  const response = await fetch(`${apiBaseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!response.ok) {
    let message = `Request failed (${response.status}). Please try again.`;
    try {
      const payload = await response.json();
      message = payload.error?.message ?? message;
    } catch {
      // Keep the readable status message when a server response is not JSON.
    }
    throw new Error(message);
  }
  if (!response.body) throw new Error('The server did not start a response stream.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const event of events) {
      const line = event.split('\n').find((part) => part.startsWith('data:'));
      if (!line) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      const payload = JSON.parse(data);
      if (payload.error) throw new Error(payload.error);
      if (typeof payload.text === 'string') onText(payload.text);
    }
  }
}
export async function generateImage(prompt, { signal, referenceImages = [] } = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 180_000);
  const abortRequest = () => controller.abort(signal?.reason);
  if (signal?.aborted) abortRequest();
  else signal?.addEventListener('abort', abortRequest, { once: true });

  try {
    const response = await fetch(`${apiBaseUrl}/api/images/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt, referenceImages }),
      signal: controller.signal,
    });

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error('The image server returned an unreadable response.');
    }
    if (!response.ok) throw new Error(payload.error?.message ?? `Image request failed (${response.status}). Please try again.`);
    if (typeof payload.image !== 'string' || !payload.image.startsWith('data:image/')) {
      throw new Error('The server did not return a generated image.');
    }
    return payload.image;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (controller.signal.aborted) throw new Error('Image generation timed out. Check provider availability and try again.');
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abortRequest);
  }
}
