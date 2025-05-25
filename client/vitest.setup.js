import 'whatwg-fetch'; // Polyfills fetch for JSDOM
import { vi } from 'vitest';

// Mock navigator.mediaDevices.getUserMedia
if (typeof global.navigator.mediaDevices === 'undefined') {
  global.navigator.mediaDevices = {};
}
global.navigator.mediaDevices.getUserMedia = vi.fn(() => Promise.resolve({
  getTracks: () => [{ stop: vi.fn() }],
}));

// Mock MediaRecorder
global.MediaRecorder = vi.fn().mockImplementation(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  requestData: vi.fn(),
  ondataavailable: null,
  onstop: null,
  state: 'inactive',
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

// Mock FileReader
const mockFileReaderInstance = {
  readAsDataURL: vi.fn(function() {
    // Simulate async behavior and call onloadend if it's set
    if (this.onloadend) {
      setTimeout(() => {
        // Check if an error should be simulated
        if (this._shouldError) {
          if (this.onerror) {
            this.onerror(new Error('Mock FileReader Error'));
          }
        } else {
          this.result = 'data:application/octet-stream;base64,bW9ja0RhdGE='; // Mock base64 data
          this.onloadend();
        }
      }, 0);
    }
  }),
  onloadend: null,
  onerror: null,
  result: null,
  _shouldError: false, // Custom property to simulate error
};

vi.spyOn(window, 'FileReader').mockImplementation(() => {
  // Reset instance for each new FileReader() call
  const newInstance = { ...mockFileReaderInstance };
  newInstance.readAsDataURL = mockFileReaderInstance.readAsDataURL.bind(newInstance);
  return newInstance;
});


// Mock RTCPeerConnection
global.RTCPeerConnection = vi.fn().mockImplementation(() => ({
  createOffer: vi.fn(() => Promise.resolve({ sdp: 'mock-offer', type: 'offer' })),
  setLocalDescription: vi.fn(() => Promise.resolve()),
  setRemoteDescription: vi.fn(() => Promise.resolve()),
  createDataChannel: vi.fn(() => ({
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn((event, cb) => {
      if (event === 'open') {
        // Simulate channel open for session active state
        setTimeout(cb, 0);
      }
    }),
    removeEventListener: vi.fn(),
    readyState: 'open',
  })),
  addTrack: vi.fn(),
  getSenders: vi.fn(() => [{ track: { stop: vi.fn() } }]),
  close: vi.fn(),
  ontrack: null,
}));

// Mock crypto.randomUUID
if (typeof global.crypto === 'undefined') {
  global.crypto = {};
}
global.crypto.randomUUID = vi.fn(() => 'mock-uuid-' + Math.random().toString(36).substring(2, 15));

// Mock Image constructor for logo
global.Image = class {
  constructor() {
    setTimeout(() => {
      if (this.onload) {
        this.onload(); // Simulate image loading successfully
      }
    }, 100);
  }
};

// Mock Character Data - include the "bill" character that CharacterSelect expects
vi.mock('../utils/characterData', () => {
  const mockCharacters = [
    { 
      id: 'bill', 
      name: 'Bill Cipher', 
      description: 'A chaotic entity.',
      voice: 'echo',
      temperature: 0.8,
      promptName: 'bill-prompt',
      avatarPath: 'mock-bill-avatar.png'
    },
    { 
      id: 'grog', 
      name: 'Grog Strongjaw', 
      description: 'A mighty barbarian.',
      voice: 'alloy',
      temperature: 0.8,
      promptName: 'grog-prompt',
      avatarPath: 'mock-grog-avatar.png'
    },
    { 
      id: 'default', 
      name: 'Default Character',
      description: 'A default character.',
      voice: 'sage',
      temperature: 0.5,
      promptName: 'default-prompt',
      avatarPath: 'mock-default-avatar.png'
    }
  ];

  return {
    getAllCharacters: vi.fn(() => mockCharacters),
    getCharacterById: vi.fn((id) => {
      const character = mockCharacters.find(c => c.id === String(id));
      return character || { 
        id: String(id), 
        name: `Mock Character ${id}`,
        description: 'A mock character for testing.',
        voice: 'sage',
        temperature: 0.7,
        promptName: 'mock-prompt',
        avatarPath: 'mock-fallback-avatar.png'
      };
    }),
    characters: mockCharacters,
  };
});

// Silence console.error and console.warn during tests if needed
// This can be useful to keep test output clean, but use with caution
// as it might hide useful warnings.
// vi.spyOn(console, 'error').mockImplementation(() => {});
// vi.spyOn(console, 'warn').mockImplementation(() => {});

// Mock static file imports (e.g., images)
// This helps Vitest/Vite handle import statements for these file types during tests.
// Return a simple string path, as it's likely used directly in `src` attributes.
vi.mock(/\.(png|jpg|jpeg|gif|svg|webp)$/i, () => 'mock-image-path.png');


// Optional: Global afterEach to clear mocks if not using `clearMocks: true` in config
// afterEach(() => {
//   vi.clearAllMocks();
// });
