# ZENITH AI

**INTELLIGENCE BEYOND BOUNDARIES.**

ZENITH AI is a responsive AI assistant with an original landing experience, a streaming chat workspace, and a server-side provider adapter. Conversation history and preferences are stored locally in the browser. There is no account synchronization.

## Requirements

- Node.js 20 or newer
- npm
- Ollama for local AI responses without a provider API key, or a hosted OpenAI-compatible API key

## Install and run

```bash
npm install
npm run dev
```

Open the Vite URL printed in the terminal (normally http://localhost:5173). The Express API runs on http://localhost:3001. The backend health check is at `/api/health`.

For a production frontend build, run `npm run build`. To run the API by itself, run `npm start`; serve the generated `dist/` directory separately and configure its `/api` routing to the backend.

The GitHub Pages site uses the `/ZENITH_AI/` project path. The included GitHub Actions workflow builds and publishes `dist/` when changes reach `main`. The chat API must be hosted separately; GitHub Pages only serves the frontend.

## Deploy the chat API to Render

The repository includes a Render Blueprint in `render.yaml` for the backend. It uses OpenRouter's OpenAI-compatible API and the currently listed free model `baidu/ernie-5.5-flash-preview:free`. Configure `AI_API_KEY` as a secret in Render; never commit it or put it in frontend variables. Free model access is rate-limited (currently 50 requests per day for accounts without purchased credits), model availability can change, and each model may have its own data terms. OpenRouter requires users to be at least 18 years old.

The Pages workflow points the frontend to `https://zenith-ai-api-x9c8.onrender.com`. Set `VITE_BASE_PATH` if the site is hosted under a different path. The API accepts a comma-separated `CLIENT_ORIGIN` list so the deployed frontend origin and local preview can both connect.

## Configure an AI provider

For local development, the backend uses Ollama's `llama3.2:3b` model at `http://127.0.0.1:11434`, so no API key is required. Ollama must be running on the same computer as the backend. For a hosted backend that friends can use, the Render Blueprint is configured for OpenRouter's free model API:

```env
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=baidu/ernie-5.5-flash-preview:free
AI_API_KEY=your_openrouter_api_key
CLIENT_ORIGIN=http://localhost:5173,https://your-site.example.com
PORT=3001
```

Create a key in [OpenRouter](https://openrouter.ai/keys), then enter it only in the backend host's secret environment settings. Free-model limits and availability can change; review the model's data terms before using it.

The API key stays on the server. Restart the backend after changing settings. Other people cannot use an Ollama instance bound to your computer's localhost; to serve multiple devices, deploy the backend with a hosted model/provider and keep its key in the backend's secret environment settings. For public deployments, set `CLIENT_ORIGIN` to the exact frontend URL or a comma-separated list of allowed origins.

## Implemented

- Original responsive landing page and ZENITH star mark
- Conversation create, history, local search, rename, clear, delete, and JSON export
- Markdown, GFM, syntax highlighting, code and message copy
- Streaming responses, stop, retry, regenerate, user message edit, typing state, and actionable errors
- Browser-persisted conversation history, timestamps, theme, and custom instructions
- Express health check, validated chat requests, API rate limiting, configurable CORS, security headers, centralized errors
- Local Ollama streaming integration and optional OpenAI-compatible server-side adapter

## Not yet integrated

File/image attachments and voice input are visibly disabled with an explanation. Authentication, cloud/database persistence, and cross-device synchronization are not implemented.

## Structure

```text
index.html
frontend/src/
  App.jsx
  main.jsx
  components/
  services/api.js
  styles/global.css
  utils/storage.js
backend/
  config/env.js
  middleware/errorHandler.js
  routes/chat.js
  services/aiProvider.js
  server.js
```

## Save and publish

The included workflow deploys the frontend to GitHub Pages on pushes to `main`. The Render Blueprint deploys the API separately. The API needs a valid server-side provider key to answer friends' requests; Ollama installed on your own computer is only available locally. Use HTTPS and a narrowly scoped production `CLIENT_ORIGIN`. Browser-local conversations remain on each device and are not uploaded or synchronized.
