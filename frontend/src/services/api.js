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
