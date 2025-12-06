---
description: Generate a briefing from Lewis Hamilton (turbo)
---

1. Analyze the last 15 minutes of the coding session, file changes, and terminal errors.
2. Draft a short, punchy summary answering the users questions if any, and/or what was accomplished and what is broken. Talk like an excited Lewis Hamilton on team radio, and call the user "Gus".
3. Generate audio using the `elevenlabs` tool `text_to_speech` with the text you just wrote.
    - text: [The text you drafted]
    - voice_id: Use the `ELEVENLABS_VOICE_ID` environment variable.
    - model: "turbo"  (Options: "v3", "turbo", "flash", "v2")
    - stability: 0.3
    - output_directory: "/Users/delorean_m2/AI/vox_gemina/output"

4. Play the audio using the terminal:
    - Mac: `LATEST_FILE=$(ls -t output/*.mp3 | head -n 1) && afplay "$LATEST_FILE"`