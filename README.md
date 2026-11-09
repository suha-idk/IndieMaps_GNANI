<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/685bc454-4c28-4e07-9e66-04f3b1715e4f

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`


## Corrective implementation notes (2026-10)

- Server-side environment loading is initialized before API module configuration is read. This avoids capturing empty API-key values during ESM module initialization.
- Gemini credentials are read when a request is made rather than frozen into a module-level client, so a backend environment update can take effect after the host applies/reloads the configuration.
- Set `GEMINI_API_KEY` through Google AI Studio's supported secret/environment configuration and optionally set `GEMINI_MODEL` (default: `gemini-2.5-flash`). Never put the key in frontend code or commit it.
- Clear, high-confidence destination and intermediate-stop commands use the local parser before remote interpretation. Current-location commands route to the existing browser Geolocation API and request a map recenter event.
- `/api/health` reports whether Gemini and Maps keys are configured and the selected model; it never returns secret values.
- Run `npm run test:language` for the local language regression cases, `npm run lint` for TypeScript validation, and `npm run build` for a production build.

Important: a source-code archive cannot verify live Google credentials, browser geolocation permissions, the Google AI Studio preview policy, or real Places/Routes responses. Those require testing in the configured project after importing these changes.
