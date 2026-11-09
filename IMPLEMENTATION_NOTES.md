# Raahi corrective implementation notes

## Root cause addressed first

The server API module reads `process.env` during module initialization. In the original source, `server.ts` imported `apiRouter` before calling `dotenv.config()`. Under ESM, imported modules are evaluated before the body of `server.ts`, so the API module could capture empty Gemini/Maps key values even though `.env` was loaded afterward. `dotenv/config` is now imported before server setup and within the API module.

The Gemini client was also constructed once from a module-level key. It is now constructed at request time using the current server-side `GEMINI_API_KEY`, so an environment update applied to the running process is not masked by a stale module-level client.

## Language changes

- Clear high-confidence destination and stop-addition commands are parsed locally before attempting remote interpretation.
- Hindi Devanagari destination/stop patterns and Hinglish stop additions have explicit extraction paths.
- Translation-only requests return no navigation actions.
- Current-location commands produce a dedicated `REQUEST_CURRENT_LOCATION` action and call the existing geolocation function, with a map recenter event on success.
- Added a small local regression script for representative Hindi, Hinglish, English, Marathi, current-location, and translation cases.

## Configuration

Set `GEMINI_API_KEY` and `VITE_GOOGLE_MAPS_API_KEY` using the supported secret/environment configuration for the AI Studio project. Optional `GEMINI_MODEL` defaults to `gemini-2.5-flash`. The `/api/health` endpoint only reports whether credentials are configured; it never returns key values.

## Verification limitation

Dependency installation could not complete in this execution environment, and the existing project dependencies were not present. Therefore the TypeScript check stopped at missing `google.maps` and `vite/client` type definitions, and the regression script/build could not be executed here. Do not treat this archive as build-verified. Run the listed checks in Google AI Studio after importing the files and configuring secrets.
