import { Router } from 'express';
import { config } from '../config/env.js';
import { providerSetupError, streamCompletion } from '../services/aiProvider.js';

const router = Router();
const MAX_MESSAGES = 40;
const MAX_CONTENT_LENGTH = 80_000;
const MAX_IMAGE_BYTES = 2_000_000;
const MAX_IMAGES_PER_MESSAGE = 4;
const IDENTITY_INSTRUCTION = 'You are ZENITH AI, an AI assistant developed by Aniruddha K M. When asked who you are, say: "I am ZENITH AI, an AI assistant, developed by Aniruddha K M."';

function validImageUrl(url) {
  const match = typeof url === 'string' && /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
  return Boolean(match && match[1].length * 0.75 <= MAX_IMAGE_BYTES);
}

function validMessageContent(content, role) {
  if (typeof content === 'string') return content.trim().length > 0 && content.length <= MAX_CONTENT_LENGTH;
  if (role !== 'user' || !Array.isArray(content) || content.length === 0 || content.length > MAX_IMAGES_PER_MESSAGE + 1) return false;

  let textLength = 0;
  let imageCount = 0;
  for (const part of content) {
    if (part?.type === 'text' && typeof part.text === 'string') {
      textLength += part.text.length;
      if (textLength > MAX_CONTENT_LENGTH) return false;
    } else if (part?.type === 'image_url' && typeof part.image_url?.url === 'string' && validImageUrl(part.image_url.url)) {
      imageCount += 1;
      if (imageCount > MAX_IMAGES_PER_MESSAGE) return false;
    } else {
      return false;
    }
  }
  return textLength > 0;
}

router.post('/', async (req, res, next) => {
  const { messages } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    res.status(400).json({ error: { code: 'INVALID_MESSAGES', message: 'Send between 1 and 40 conversation messages.' } });
    return;
  }
  const valid = messages.every((message, index) =>
    message &&
    (['user', 'assistant'].includes(message.role) || (message.role === 'system' && index === 0)) &&
    validMessageContent(message.content, message.role),
  );
  if (!valid) {
    res.status(400).json({ error: { code: 'INVALID_MESSAGE', message: 'Each message needs a valid role and text under 80,000 characters.' } });
    return;
  }

  const setupError = providerSetupError();
  if (setupError) {
    res.status(setupError.status).json({ error: { code: setupError.code, message: setupError.message } });
    return;
  }

  const systemMessage = messages[0]?.role === 'system' ? messages[0] : null;
  const messagesWithIdentity = systemMessage
    ? [{ ...systemMessage, content: `${systemMessage.content}\n\n${IDENTITY_INSTRUCTION}` }, ...messages.slice(1)]
    : [{ role: 'system', content: IDENTITY_INSTRUCTION }, ...messages];

  const abortController = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) abortController.abort();
  });

  try {
    const upstream = await streamCompletion(messagesWithIdentity, abortController.signal);
    res.status(200).set({
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    const reader = upstream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n');
        buffer = events.pop() ?? '';
        for (const event of events) {
          if (config.provider === 'ollama') {
            if (!event.trim()) continue;
            try {
              const payload = JSON.parse(event);
              if (payload.error) throw new Error(payload.error);
              const text = payload.message?.content;
              if (typeof text === 'string' && text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
            } catch (error) {
              if (error instanceof SyntaxError) continue;
              throw error;
            }
          } else {
            if (!event.startsWith('data:')) continue;
            const data = event.slice(5).trim();
            if (data === '[DONE]') continue;
            try {
              const text = JSON.parse(data).choices?.[0]?.delta?.content;
              if (typeof text === 'string' && text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
            } catch {
              // Ignore provider metadata events that are not completion chunks.
            }
          }
        }
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    if (abortController.signal.aborted) return;
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: 'The AI response was interrupted. Please try again.' })}\n\n`);
      res.end();
      return;
    }
    next(error);
  }
});

export default router;
