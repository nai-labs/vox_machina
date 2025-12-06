# VOX MACHINA
> **Neural Voice Interface & Cyberpunk Console**

![Banner](banner.png)

## Overview

**VOX MACHINA** is a cutting-edge neural voice interface wrapped in an immersive, cyberpunk-inspired visual console. It serves as a unified platform for testing and interacting with next-generation real-time AI models.

The system features a dual-core architecture that allows seamless switching between:
*   **OpenAI Realtime API**: For low-latency, expressive voice conversations.
*   **Google Gemini Multimodal Live API**: For advanced multimodal interactions and reasoning.

Designed with a visually distinct aesthetic, the console provides real-time feedback through dynamic waveforms, reactive character portraits, and a CRT-styled terminal interface.

## Key Features

*   **⚡️ Dual-Core AI Engine**: Toggle instantly between OpenAI's GPT-4o Realtime and Google's Gemini Multimodal Live models.
*   **🎨 Immersive Cyberpunk UI**: A fully styled interface featuring scanlines, neon accents, terminal typography, and reactive animations.
*   **🌊 Dynamic Audio Visualization**: Real-time waveform rendering that responds to both user input and AI voice output.
*   **🗣️ Reactive Character Portraits**: Visual avatars that react to voice intensity and conversation states, enhancing presence.
*   **🎭 Persona System**: Extensible character configuration system allowing for distinct voices, personalities, and system prompts.
*   **💾 Robust Session Management**:
    *   Unified audio capture and recording.
    *   One-click export of conversation audio (WAV).
    *   Persistent session history.
*   **🔌 LocalTunnel Integration**: Built-in support for exposing the local server to the web for reliable WebSocket connections.

## Technology Stack

### Client (Frontend)
*   **React 18** & **Vite**: Fast, modern UI development.
*   **TailwindCSS**: Custom configuration for the "Cyber" design system.
*   **Lucide React**: Vector icons aligned with the technical aesthetic.
*   **Web Audio API**: For real-time audio processing and visualization.

### Server (Backend)
*   **Node.js** & **Express**: Robust application server.
*   **WebSocket (ws)**: Handling bi-directional streaming for Gemini.
*   **FFmpeg**: High-performance audio conversion and processing.

## Getting Started

### Prerequisites
*   **Node.js** (v18 or higher recommended)
*   Valid API Keys for:
    *   OpenAI (`OPENAI_API_KEY`)
    *   Google Gemini (`GEMINI_API_KEY`)

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/yourusername/vox-machina.git
    cd vox_machina
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Environment Configuration**
    Create a `.env` file in the root directory (or copy the example).
    ```bash
    cp .env.example .env
    ```

    Fill in your API keys:
    ```env
    OPENAI_API_KEY=your_sk_...
    OPENAI_API_MODEL=gpt-4o-realtime-preview-2024-12-17
    GEMINI_API_KEY=your_gemini_key...
    ```

### Running the Application

1.  **Start the Development Server**
    ```bash
    npm run dev
    ```
    This command starts both the Express backend and the Vite frontend.

2.  **Access the Console**
    Open your browser and navigate to:
    *   Local: `http://localhost:5173`
    *   Public Tunnel: Watch the terminal output for the `localtunnel` URL (useful for testing on other devices).

## Usage Guide

### Interface Controls
*   **Provider Toggle**: Use the switch in the top header to change between "OpenAI" and "Gemini" modes.
*   **Character Selection**: Click "Change Persona" to browse and select different AI characters.
*   **Microphone**: Click the microphone icon or press the defined hotkey to toggle voice input.

### Commands
The system emphasizes voice interaction, but visual intensity can be controlled via text commands (or system prompts):
*   `/level[1-10]/`: Adjusts the visual intensity of the character portrait.
    *   Example: `/level10/` triggers maximum intensity state.

## Customization

### Adding Characters
Modify `characters.json` in the root directory to add new personas.

```json
"character_id": {
  "id": "character_id",
  "name": "Display Name",
  "description": "Brief description appearing in selection menu",
  "voice": "alloy", // OpenAI voice ID or Gemini voice name
  "promptName": "System Prompt Identifier",
  "iconType": "terminal",
  "prompt": "Your custom system instructions here..."
}
```

## License
MIT
