import { Router } from 'express';
import { config } from '../config/env.js';
import { providerSetupError, streamCompletion } from '../services/aiProvider.js';

const router = Router();
const MAX_MESSAGES = 40;
const MAX_CONTENT_LENGTH = 16_000;

router.post('/', async (req, res, next) => {
  const { messages } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    res.status(400).json({ error: { code: 'INVALID_MESSAGES', message: 'Send between 1 and 40 conversation messages.' } });
    return;
  }
  const valid = messages.every((message, index) =>
    message &&
    (['user', 'assistant'].includes(message.role) || (message.role === 'system' && index === 0)) &&
    typeof message.content === 'string' &&
    message.content.trim().length > 0 &&
    message.content.length <= MAX_CONTENT_LENGTH,
  );
  if (!valid) {
    res.status(400).json({ error: { code: 'INVALID_MESSAGE', message: 'Each message needs a valid role and text under 16,000 characters.' } });
    return;
  }

  const setupError = providerSetupError();
  if (setupError) {
    res.status(setupError.status).json({ error: { code: setupError.code, message: setupError.message } });
    return;
  }

  const abortController = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) abortController.abort();
  });

  try {
    const upstream = await streamCompletion(messages, abortController.signal);
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
