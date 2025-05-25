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

vi.mock('../hooks/useWebRTCSession', () => ({
  useWebRTCSession: () => ({
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
