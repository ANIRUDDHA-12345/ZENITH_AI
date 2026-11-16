import { config } from '../config/env.js';

export class ProviderError extends Error {
  constructor(message, status = 502, code = 'PROVIDER_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function providerSetupError() {
  if (!['ollama', 'openai-compatible'].includes(config.provider)) {
    return new ProviderError('The configured AI provider is not supported by this server.', 503, 'PROVIDER_UNSUPPORTED');
  }
  if (config.provider === 'openai-compatible' && !config.apiKey) {
    return new ProviderError('AI is not configured yet. Add your provider API key to the server environment settings.', 503, 'AI_NOT_CONFIGURED');
  }
  return null;
}

export async function streamCompletion(messages, signal) {
  const setupError = providerSetupError();
  if (setupError) throw setupError;

  const isOllama = config.provider === 'ollama';
  const hasImages = messages.some((message) =>
    Array.isArray(message.content) && message.content.some((part) => part.type === 'image_url'),
  );
  if (isOllama && hasImages) {
    throw new ProviderError('Image attachments require the configured OpenRouter-compatible provider.', 503, 'VISION_PROVIDER_UNAVAILABLE');
  }
  let response;
  try {
    response = await fetch(`${config.baseUrl}${isOllama ? '/api/chat' : '/chat/completions'}`, {
      method: 'POST',
      headers: {
        ...(isOllama ? {} : { authorization: `Bearer ${config.apiKey}` }),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: hasImages ? config.visionModel : config.model, messages, stream: true }),
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ProviderError(
      isOllama
        ? 'Could not reach Ollama. Start Ollama and make sure it is listening on http://127.0.0.1:11434.'
        : 'Could not reach the AI provider. Check the server connection and provider URL.',
      503,
      isOllama ? 'OLLAMA_UNAVAILABLE' : 'PROVIDER_UNAVAILABLE',
    );
  }

  if (!response.ok) {
    throw new ProviderError(
      response.status === 429
        ? 'The AI provider is rate limiting requests. Please wait a moment and try again.'
        : isOllama
          ? 'Ollama could not run the selected model. Check that the model is installed with `ollama list`.'
          : 'The AI provider rejected the request. Check the provider configuration and try again.',
      response.status === 429 ? 429 : 502,
      response.status === 429 ? 'PROVIDER_RATE_LIMIT' : 'PROVIDER_REJECTED',
    );
  }
  if (!response.body) throw new ProviderError('The AI provider returned an empty response.');
  return response.body;
}
export async function generateImage(prompt, referenceImages, signal) {
  if (config.provider !== 'openai-compatible' || !config.apiKey) {
    throw new ProviderError('Image generation requires a configured OpenRouter-compatible provider and API key.', 503, 'IMAGE_GENERATION_UNAVAILABLE');
  }

  let response;
  try {
    response = await fetch(`${config.baseUrl}/images`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: config.imageModel,
        prompt,
        resolution: '1K',
        aspect_ratio: '1:1',
        ...(referenceImages.length > 0
          ? { input_references: referenceImages.map((url) => ({ type: 'image_url', image_url: { url } })) }
          : {}),
      }),
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ProviderError('Could not reach the image-generation provider. Check the server connection and provider URL.', 503, 'IMAGE_PROVIDER_UNAVAILABLE');
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ProviderError('The image provider returned an unreadable response.', 502, 'IMAGE_PROVIDER_INVALID_RESPONSE');
  }

  if (!response.ok) {
    const statusMessages = {
      401: 'The AI provider rejected its API key. Check the key in the backend environment settings.',
      402: 'The AI provider account may have insufficient credits or an exhausted quota.',
      403: 'The AI provider denied access to the configured image model.',
      404: 'The configured image model or provider endpoint was not found.',
      429: 'The AI provider is rate limiting image requests. Please wait a moment and try again.',
    };
    throw new ProviderError(
      statusMessages[response.status] ?? `Image generation failed (HTTP ${response.status}).`,
      response.status === 429 ? 429 : 502,
      response.status === 429 ? 'PROVIDER_RATE_LIMIT' : 'IMAGE_GENERATION_FAILED',
    );
  }

  const image = payload?.data?.[0];
  if (typeof image?.b64_json !== 'string' || !image.b64_json) {
    throw new ProviderError('The image provider did not return an image.', 502, 'IMAGE_PROVIDER_EMPTY_RESPONSE');
  }
  const mediaType = image.media_type ?? 'image/png';
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mediaType)) {
    throw new ProviderError('The image provider returned an unsupported image format.', 502, 'IMAGE_PROVIDER_INVALID_FORMAT');
  }
  return { data: image.b64_json, mediaType };
}
