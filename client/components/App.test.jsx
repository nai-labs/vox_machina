import { vi } from 'vitest';

// Mock everything that could cause issues
vi.mock('/assets/vox-machina-logo.png', () => 'mock-logo.png');

vi.mock('../hooks/useAudioRecording', () => ({
  useAudioRecording: () => ({
    lastAudioResponse: null,
    lastMessageAudio: null,
    isRecordingCurrentResponse: false,
    setupMediaRecorder: vi.fn(),
    startRecordingResponse: vi.fn(),
    stopRecordingResponse: vi.fn(),
    stopRecording: vi.fn(),
    clearAudioHistory: vi.fn()
  })
}));

vi.mock('../providers/openai/OpenAISessionProvider.js', () => ({
  useOpenAISession: () => ({
    isSessionActive: false,
    setIsSessionActive: vi.fn(),
    dataChannel: null,
    apiModelName: null,
    isMicMuted: false,
    audioElement: { current: null },
    isSessionInitializedRef: { current: false },
    toggleMicMute: vi.fn(),
    startSession: vi.fn(),
    stopSession: vi.fn(),
    sendClientEvent: vi.fn(),
    sendTextMessage: vi.fn()
  })
}));

vi.mock('../providers/gemini/GeminiSessionProvider.js', () => ({
  useGeminiSession: () => ({
    isSessionActive: false,
    setIsSessionActive: vi.fn(),
    apiModelName: null,
    isMicMuted: true,
    audioElement: { current: null },
    isSessionInitializedRef: { current: false },
    toggleMicMute: vi.fn(),
    startSession: vi.fn(),
    stopSession: vi.fn(),
    sendTextMessage: vi.fn(),
    sendAudioData: vi.fn()
  })
}));

vi.mock('../hooks/useUnifiedAudioCapture', () => ({
  useUnifiedAudioCapture: () => ({
    fullConversationAudio: null,
    lastResponseAudio: null,
    isCapturing: false,
    setupWebRTCCapture: vi.fn(),
    addPcmChunk: vi.fn(),
    startResponseCapture: vi.fn(),
    finalizePcmResponse: vi.fn(),
    getFullConversationPcmAsWav: vi.fn(),
    stopCapture: vi.fn(),
    clearAudioData: vi.fn(),
    pcmToWavBlob: vi.fn()
  })
}));

vi.mock('../hooks/usePcmPlayer.js', () => ({
  usePcmPlayer: () => ({
    addAudioChunk: vi.fn(),
    ensureAudioContext: vi.fn(),
    isPlaying: false,
    isContextStarted: false,
    analyserNode: null,
    clearCurrentResponseAccumulator: vi.fn(),
    finalizeCurrentResponse: vi.fn(),
    getLastResponsePcmData: vi.fn()
  })
}));

vi.mock('../hooks/usePcmStreamer.js', () => ({
  usePcmStreamer: () => ({
    startStreaming: vi.fn(),
    stopStreaming: vi.fn(),
    isStreaming: false
  })
}));

vi.mock('../utils/audioUtils', () => ({
  decodeBase64PcmToFloat32: vi.fn(() => new Float32Array(0))
}));

vi.mock('../hooks/useAudioExport', () => ({
  useAudioExport: () => ({
    isExporting: false,
    exportStatus: null,
    exportLastAudio: vi.fn(),
    exportFullAudio: vi.fn()
  })
}));

vi.mock('./EventLog', () => ({ default: () => null }));
vi.mock('./SessionControls', () => ({ default: () => null }));
vi.mock('./WaveformVisualizer', () => ({ default: () => null }));
vi.mock('./CharacterSelect', () => ({ default: () => null }));
vi.mock('./SplashScreen', () => ({ default: () => null }));

describe('App component', () => {
  it('should import without errors', () => {
    // Just test that the module can be imported
    expect(() => {
      require('./App');
    }).not.toThrow();
  });
});
