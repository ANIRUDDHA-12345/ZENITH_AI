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
  let response;
  try {
    response = await fetch(`${config.baseUrl}${isOllama ? '/api/chat' : '/chat/completions'}`, {
      method: 'POST',
      headers: {
        ...(isOllama ? {} : { authorization: `Bearer ${config.apiKey}` }),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: config.model, messages, stream: true }),
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
