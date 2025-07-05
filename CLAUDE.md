# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Start development**: `npm run dev` - Starts Express server with Vite middleware and creates public tunnel
- **Build application**: `npm run build` - Builds both client and server bundles
- **Run tests**: `npm test` - Runs all tests via vitest
- **Test client only**: `npm test:client` - Client-side tests
- **Test server only**: `npm test:server` - Server-side tests
- **Test with UI**: `npm test:ui` - Opens vitest UI
- **Lint code**: `npm run lint` - ESLint with auto-fix

## Project Architecture

VOX MACHINA is a multi-provider voice AI testing framework with the following key architectural components:

### Multi-Provider Support
- **OpenAI Provider** (`client/providers/openai/OpenAISessionProvider.js`): WebRTC-based real-time audio using OpenAI's Realtime API
- **Gemini Provider** (`client/providers/gemini/GeminiSessionProvider.js`): WebSocket-based audio streaming using Google's Gemini Live API
- **Provider Selection**: Runtime switching between providers via UI toggle

### Server Architecture (`server.js`)
- Express server with Vite SSR middleware
- **OpenAI Route** (`/token`): Generates ephemeral keys and configures character prompts
- **Audio Processing** (`/save-audio`): Handles WebM to MP3 conversion with silence removal using ffmpeg
- **Gemini WebSocket Proxy** (`/ws/gemini`): Bridges client to Google's Live API with protocol translation
- **Public Tunneling**: Uses localtunnel for external access

### Client Architecture
- **React SPA** with cyberpunk-themed UI using TailwindCSS
- **Provider Abstraction**: Unified interface in `App.jsx` that switches between OpenAI and Gemini sessions
- **Audio System**: 
  - OpenAI: MediaRecorder for recording, WebRTC for real-time audio
  - Gemini: PCM player/streamer for audio processing
- **Character System**: JSON-based persona configuration with voice attributes

### Key Data Flow
1. **OpenAI**: Client ↔ WebRTC ↔ OpenAI Realtime API
2. **Gemini**: Client ↔ WebSocket Proxy (server.js) ↔ Google Live API
3. **Audio Export**: Real-time recording → WebM → MP3 with silence removal → `outputs/` directory

### Character Configuration
Characters are defined in `characters.json` with structured prompts that include vocal coaching instructions. Each character has:
- Voice model selection (shimmer, coral, sage)
- Temperature settings
- Detailed personality and vocal pattern prompts

### Audio Processing Pipeline
- **Recording**: Automatic session recording with manual export controls
- **Format Support**: WebM (raw) and MP3 (processed) with descriptive timestamps
- **Silence Removal**: Automatic removal of gaps >1 second during MP3 conversion
- **Export Types**: "last-response" vs "full-conversation"

## Important Files

- `server.js` - Main server with provider routing and audio processing
- `client/components/App.jsx` - Main React component with provider switching logic
- `client/providers/` - Provider-specific session management
- `characters.json` - Character definitions and prompts
- `outputs/` - Generated audio files (gitignored)
- `server-utils.js` - Character loading utilities

## Development Notes

- Both API keys (OPENAI_API_KEY, GEMINI_API_KEY) should be set in `.env`
- Server creates public tunnel automatically for external testing
- Audio files are timestamped and stored in `outputs/` directory
- Provider switching is only available when no session is active
- Gemini integration uses direct WebSocket to Google's Live API