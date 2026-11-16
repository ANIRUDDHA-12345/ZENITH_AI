import { Router } from 'express';
import { generateImage, ProviderError, providerSetupError } from '../services/aiProvider.js';

const router = Router();
const MAX_PROMPT_LENGTH = 4_000;
const MAX_REFERENCES = 4;
const MAX_REFERENCE_BYTES = 2_000_000;

function validImageUrl(url) {
  const match = typeof url === 'string' && /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
  return Boolean(match && match[1].length * 0.75 <= MAX_REFERENCE_BYTES);
}

router.post('/generate', async (req, res, next) => {
  const { prompt, referenceImages = [] } = req.body ?? {};
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_PROMPT_LENGTH) {
    res.status(400).json({ error: { code: 'INVALID_PROMPT', message: `Enter an image prompt under ${MAX_PROMPT_LENGTH} characters.` } });
    return;
  }
  if (!Array.isArray(referenceImages) || referenceImages.length > MAX_REFERENCES || !referenceImages.every(validImageUrl)) {
    res.status(400).json({ error: { code: 'INVALID_REFERENCES', message: `Attach up to ${MAX_REFERENCES} valid reference images.` } });
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
    const image = await generateImage(prompt.trim(), referenceImages, abortController.signal);
    res.json({ image: `data:${image.mediaType};base64,${image.data}` });
  } catch (error) {
    if (abortController.signal.aborted) return;
    if (error instanceof ProviderError) {
      res.status(error.status).json({ error: { code: error.code, message: error.message } });
      return;
    }
    next(error);
  }
});

export default router;
