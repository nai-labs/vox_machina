# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev          # Start development server (Express + Vite)
npm run build        # Production build (client + server)
npm start            # Run production server

npm test             # Run all tests
npm run test:client  # Client tests only (jsdom environment)
npm run test:server  # Server tests only (node environment)
npm run test:ui      # Visual test UI

npm run lint         # ESLint with auto-fix (.js, .jsx)
```

## Environment Setup

Copy `.env.example` to `.env` and configure:
- `OPENAI_API_KEY` - Required for OpenAI Realtime API
- `GEMINI_API_KEY` - Required for Gemini Multimodal Live API
- `GEMINI_THINKING_BUDGET` - Optional: 0=disable, -1=dynamic, 1-24576=explicit

Character personas are defined in `characters.json` (copy from `characters.example.json`).

## Architecture Overview

**Dual-AI Voice Interface** - Real-time voice conversations with switchable AI backends.

### Server (server.js)
- Express server with Vite SSR middleware
- `/token` - Generates ephemeral OpenAI session tokens
- `/save-audio` - Audio export/processing via FFmpeg
- `/ws/gemini` - WebSocket proxy to Gemini Live API

### Client (client/)
- React 18 with Vite SSR
- **Provider pattern** for AI backends:
  - `providers/openai/OpenAISessionProvider.js` - WebRTC-based (RTCPeerConnection)
  - `providers/gemini/GeminiSessionProvider.js` - WebSocket-based (proxied through server)
- **Key hooks**:
  - `useOpenAISession.js` - OpenAI Realtime API integration
  - `useGeminiSession.js` - Gemini Multimodal Live API
  - `useUnifiedAudioCapture.js` - Cross-provider audio capture
  - `usePcmPlayer.js` / `usePcmStreamer.js` - PCM audio playback/streaming

### Data Flow
1. User selects provider (OpenAI/Gemini) and character persona
2. Session connects via WebRTC (OpenAI) or WebSocket proxy (Gemini)
3. Audio streams bidirectionally with real-time visualization
4. Character portraits react to voice intensity levels

## Styling

Cyberpunk design system in `tailwind.config.js`:
- Colors: `cyber-dark`, `cyber-medium`, `neon-primary` (#0affff), `neon-tertiary` (#ff00aa)
- Font: Share Tech Mono
- Animations: `pulse-slow`, `border-pulse`, `scanline`, `glitch`
- Custom CSS in `client/base.css`

## Testing Setup

- **Vitest** with jsdom for client, node for server
- Test setup (`client/vitest.setup.js`) mocks: MediaRecorder, AudioContext, getUserMedia, RTCPeerConnection, FileReader
- Mock character data provided automatically in tests
