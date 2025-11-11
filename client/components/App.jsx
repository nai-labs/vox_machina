import { useEffect, useState, useRef } from "react";
import logo from "/assets/vox-machina-logo.png";
import EventLog from "./EventLog";
import SessionControls from "./SessionControls";
import WaveformVisualizer from "./WaveformVisualizer";
import CharacterSelect from "./CharacterSelect";
import SplashScreen from "./SplashScreen";
import { Download, Cpu, Terminal, Zap, Activity, User, Save, Settings } from "react-feather"; // Added Settings
import { useAudioRecording } from "../hooks/useAudioRecording";
import { useUnifiedAudioCapture } from "../hooks/useUnifiedAudioCapture"; // New unified capture
// import { useWebRTCSession } from "../hooks/useWebRTCSession"; // Old import
import { useOpenAISession } from "../providers/openai/OpenAISessionProvider.js"; // New OpenAI provider
import { useGeminiSession } from "../providers/gemini/GeminiSessionProvider.js"; // New Gemini provider
import { useAudioExport } from "../hooks/useAudioExport";
import { usePcmPlayer } from "../hooks/usePcmPlayer.js"; 
import { usePcmStreamer } from "../hooks/usePcmStreamer.js"; // Import PCM streamer hook

export default function App() {
  const [events, setEvents] = useState([]);
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [isCharacterSelectionMode, setIsCharacterSelectionMode] = useState(true);
  const [showSplashScreen, setShowSplashScreen] = useState(true);
  const [currentProviderType, setCurrentProviderType] = useState('openai'); // 'openai' or 'gemini'
  
  // Track processed events to prevent duplicates
  const processedEventsRef = useRef(new Set());

  // Custom hooks
  const audioRecording = useAudioRecording(); // Legacy OpenAI recording (still used for real-time response capture)
  const unifiedAudioCapture = useUnifiedAudioCapture(); // New unified capture system
  const audioExport = useAudioExport();
  const pcmPlayer = usePcmPlayer(); 
  const pcmStreamer = usePcmStreamer(); // Instantiate PCM streamer for user input

  // Instantiate providers - only one will be effectively used based on currentProviderType
  const openaiSession = useOpenAISession();
  const geminiSession = useGeminiSession();

  // currentSession will point to the active provider's hook result
  const currentSession = currentProviderType === 'openai' ? openaiSession : geminiSession;

  function handleSelectCharacter(character) {
    setSelectedCharacter(character);
    setIsCharacterSelectionMode(false);
    // It's a good practice to ensure AudioContext is ready on a user gesture
    // especially if it might be used soon after for Gemini.
    if (currentProviderType === 'gemini') {
      pcmPlayer.ensureAudioContext();
    }
  }
  
  function handleBackToCharacterSelect() {
    setIsCharacterSelectionMode(true);
  }
  
  async function startSession() {
    try {
      processedEventsRef.current.clear();
      setEvents([]); // Clear UI events on new session start

      // Ensure AudioContext is active for Gemini before starting session,
      // as audio might come back immediately.
      if (currentProviderType === 'gemini') {
        pcmPlayer.ensureAudioContext();
      }

      if (currentProviderType === 'openai') {
        await openaiSession.startSession(selectedCharacter, (stream) => {
          // Set up both legacy recording (for real-time response capture) and unified capture
          audioRecording.setupMediaRecorder(stream);
          unifiedAudioCapture.setupWebRTCCapture(stream);
        });
      } else if (currentProviderType === 'gemini') {
      // Clear any previous audio data
      unifiedAudioCapture.clearAudioData();
      
      await geminiSession.startSession(
        selectedCharacter,
        (geminiEvent) => { // onEventReceived
          console.log('[App.jsx] Gemini Event Received:', geminiEvent);
          const eventId = geminiEvent.event_id || `${geminiEvent.type}-${geminiEvent.timestamp || Date.now()}-${Math.random()}`;
          if (processedEventsRef.current.has(eventId)) {
            return;
          }
          processedEventsRef.current.add(eventId);
          setEvents((prev) => [geminiEvent, ...prev]);

          if (geminiEvent.type === 'gemini_generation_start') {
            console.log('[App.jsx] Gemini generation started, beginning response capture.');
            unifiedAudioCapture.startResponseCapture();
          } else if (geminiEvent.type === 'gemini_generation_complete') {
            console.log('[App.jsx] Gemini generation complete, finalizing unified audio capture.');
            pcmPlayer.finalizeCurrentResponse();
            unifiedAudioCapture.finalizePcmResponse();
          }
        },
        (audioChunkMessage) => { // onAudioChunkReceived
          if (audioChunkMessage && audioChunkMessage.type === 'gemini_audio_chunk' && audioChunkMessage.data) {
            console.log('[App.jsx] Received Gemini Audio Chunk, passing to player and unified capture:', audioChunkMessage.data.length);
            
            // Decode the base64 PCM data to add to unified capture
            try {
              const byteString = atob(audioChunkMessage.data);
              const byteArray = new Uint8Array(byteString.length);
              for (let i = 0; i < byteString.length; i++) {
                byteArray[i] = byteString.charCodeAt(i);
              }
              const pcm16BitView = new Int16Array(byteArray.buffer);
              const float32Array = new Float32Array(pcm16BitView.length);
              for (let i = 0; i < pcm16BitView.length; i++) {
                float32Array[i] = pcm16BitView[i] / 32768.0;
              }
              
              // Add to unified capture
              unifiedAudioCapture.addPcmChunk(float32Array);
            } catch (error) {
              console.error('[App.jsx] Error processing PCM chunk for unified capture:', error);
            }
            
            // Still send to PCM player for real-time playback
            pcmPlayer.addAudioChunk(audioChunkMessage.data);
          } else {
            console.warn('[App.jsx] Received malformed audio chunk message:', audioChunkMessage);
          }
        }
      );
    }
    } catch (error) {
      console.error("Failed to start session:", error);
      // Show error to user
      setEvents((prev) => [
        {
          type: 'error',
          message: `Failed to start ${currentProviderType.toUpperCase()} session: ${error.message}`,
          timestamp: new Date().toISOString()
        },
        ...prev
      ]);
    }
  }

  function stopSession() {
    currentSession.stopSession(() => {
      audioRecording.stopRecording();
      audioRecording.clearAudioHistory();
      unifiedAudioCapture.stopCapture();
    });
  }

  // sendClientEvent is specific to OpenAI's event structure via data channel.
  function sendClientEvent(message) {
    if (currentProviderType === 'openai') {
      openaiSession.sendClientEvent(message, setEvents);
    } else {
      // Gemini might have a different way or might not use generic client events.
      // For now, this function is OpenAI-specific.
      console.warn("sendClientEvent called for non-OpenAI provider. Ignoring.");
    }
  }

  function sendTextMessage(message) {
    if (currentProviderType === 'gemini') {
      pcmPlayer.clearCurrentResponseAccumulator(); // Clear any previous response audio before new input
    }
    currentSession.sendTextMessage(message, setEvents);
  }

  // Functions to control user audio streaming for Gemini
  const handleStartUserAudioStream = () => {
    if (currentProviderType === 'gemini' && geminiSession.isSessionActive && !pcmStreamer.isStreaming) {
      pcmPlayer.clearCurrentResponseAccumulator(); // Clear for new response based on voice input
      console.log('[App.jsx] Starting user audio stream for Gemini...');
      pcmStreamer.startStreaming((base64PcmChunk) => {
        if (geminiSession.isSessionActive) { 
          geminiSession.sendAudioData(base64PcmChunk); 
        }
      });
    }
  };

  const handleStopUserAudioStream = () => {
    if (pcmStreamer.isStreaming) {
      console.log('[App.jsx] Stopping user audio stream for Gemini...');
      pcmStreamer.stopStreaming();
      // Optionally send an audio_stream_end message to Google via server if needed by VAD
      // geminiSession.sendAudioStreamEndSignal(); // Method to be added
    }
  };

  // Attach event listeners to the data channel when a new one is created
  useEffect(() => {
    if (currentProviderType === 'openai' && openaiSession.dataChannel) { // Check provider type
      const handleMessage = (e) => {
        const eventData = JSON.parse(e.data);
        // Create a unique identifier for the event
        const eventId = eventData.event_id || `${eventData.type}-${eventData.timestamp || Date.now()}`;

        // Check if we've already processed this event (for UI and for recording triggers)
        if (processedEventsRef.current.has(eventId)) {
          console.log(`[DEBUG] Duplicate event detected and skipped for all processing: ${eventId}`);
          return; // Return early for duplicates, preventing all further processing
        }
        
        // Add to processed events set (for UI and to prevent re-triggering recording logic)
        processedEventsRef.current.add(eventId);
        
        // Add the event to UI state
        setEvents((prev) => [eventData, ...prev]);
        console.log(`[DEBUG] Added new UI event: ${eventData.type} (${eventId})`);
        
        // Handle specific event types for recording, only for non-duplicates
        if (eventData.type === "response.audio_transcript.delta" && !audioRecording.isRecordingCurrentResponse) {
          console.log("[DEBUG] First audio transcript delta - starting audio recording");
          audioRecording.startRecordingResponse();
        }
        
        if (eventData.type === "response.done") {
          console.log("[DEBUG] Response done event - stopping audio recording");
          audioRecording.stopRecordingResponse();
        }
      };

      openaiSession.dataChannel.addEventListener("message", handleMessage); // Corrected: openaiSession

      const handleOpen = () => {
        console.log("Data channel opened");
        openaiSession.setIsSessionActive(true); // Corrected: openaiSession
        setEvents([]); // Clear UI events
        processedEventsRef.current.clear(); // Clear processed event IDs on new session
        
        setTimeout(() => {
          console.log("Session fully initialized");
          openaiSession.isSessionInitializedRef.current = true; // Corrected: openaiSession
        }, 2000);
      };
      openaiSession.dataChannel.addEventListener("open", handleOpen); // Corrected: openaiSession

      // Cleanup function
      return () => {
        if (openaiSession.dataChannel) { // Corrected: openaiSession
          openaiSession.dataChannel.removeEventListener("message", handleMessage); // Corrected: openaiSession
          openaiSession.dataChannel.removeEventListener("open", handleOpen); // Corrected: openaiSession
        }
      };
    }
    // Ensure all dependencies that are used inside the effect and can change are listed.
  }, [currentProviderType, openaiSession, openaiSession.dataChannel, audioRecording]); // Updated dependencies

  // Handle splash screen completion
  const handleSplashComplete = () => {
    setShowSplashScreen(false);
  };

  const ProviderToggle = () => (
    <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 p-1 sm:p-2 rounded-md bg-cyber-dark-secondary border border-neon-secondary shadow-lg">
      <span className="text-xs text-neon-secondary uppercase tracking-wider mr-0 sm:mr-2 hidden sm:inline">Provider:</span>
      <div className="flex gap-1">
        <button
          onClick={() => setCurrentProviderType('openai')}
          disabled={currentSession.isSessionActive}
          className={`terminal-button px-2 sm:px-3 py-1 text-xs sm:text-sm ${
            currentProviderType === 'openai' ? 'bg-neon-primary text-cyber-dark' : 'text-neon-primary hover:bg-neon-primary/20'
          } ${currentSession.isSessionActive ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          OpenAI
        </button>
        <button
          onClick={() => setCurrentProviderType('gemini')}
          disabled={currentSession.isSessionActive}
          className={`terminal-button px-2 sm:px-3 py-1 text-xs sm:text-sm ${
            currentProviderType === 'gemini' ? 'bg-neon-primary text-cyber-dark' : 'text-neon-primary hover:bg-neon-primary/20'
          } ${currentSession.isSessionActive ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          Gemini
        </button>
      </div>
    </div>
  );

  return (
    <div className="bg-cyber-dark text-cyber-text font-cyber h-screen overflow-hidden">
      {showSplashScreen ? (
        <SplashScreen onComplete={handleSplashComplete} />
      ) : (
        <>
          {/* Background effects */}
          <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
            <div className="terminal-scan-line"></div>
          </div>
          <div className="absolute inset-0 bg-gradient-radial from-cyber-dark via-cyber-dark to-black opacity-80 pointer-events-none"></div>
          
          {/* Fast flickering particles in the background */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none z-20">
            {Array.from({ length: 30 }).map((_, i) => (
              <div
                key={i}
                className="absolute rounded-full bg-neon-primary/30"
                style={{
                  width: `${Math.random() * 3 + 1}px`,
                  height: `${Math.random() * 3 + 1}px`,
                  top: `${Math.random() * 100}%`,
                  left: `${Math.random() * 100}%`,
                  animation: `flicker ${Math.random() * 0.8 + 0.2}s infinite steps(2, start)`,
                  animationDelay: `${Math.random() * 0.5}s`
                }}
              />
            ))}
          </div>
          
          <nav className="absolute top-0 left-0 right-0 h-20 sm:h-20 md:h-24 flex items-center z-10">
            <div className="terminal-header flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-4 w-full m-2 sm:m-4 pb-2 border-0 border-b border-solid border-neon-primary">
              <div className="flex items-center gap-2 sm:gap-4 order-1 sm:order-1">
                <div className="flex items-center gap-2">
                  <Cpu size={16} sm:size={20} className="text-neon-primary" />
                  <Terminal size={16} sm:size={20} className="text-neon-secondary" />
                </div>
                <h1 className="glitch-text neon-text text-sm sm:text-base lg:text-lg" data-text="VOX MACHINA CONSOLE">
                  <span className="hidden sm:inline">VOX MACHINA CONSOLE</span>
                  <span className="sm:hidden">VOX MACHINA</span>
                </h1>
              </div>

              <div className="order-3 sm:order-2">
                <ProviderToggle />
              </div>
              
              {/* Logo in header */}
              <div className="h-10 sm:h-12 lg:h-14 relative order-2 sm:order-3">
                <img 
                  src={logo} 
                  alt="Vox Machina" 
                  className="h-full w-auto mix-blend-screen"
                  style={{ 
                    filter: 'drop-shadow(0 0 6px rgba(10, 255, 255, 0.6))',
                  }}
                />
              </div>
            </div>
          </nav>
          
          {/* Film grain effect - more visible */}
          <div className="fixed inset-0 z-0 pointer-events-none opacity-40 mix-blend-overlay">
            <div className="absolute inset-0 bg-noise animate-noise"></div>
          </div>
          
          {/* Additional scan lines */}
          <div className="fixed inset-0 z-0 pointer-events-none">
            <div className="absolute inset-0 bg-scan-lines"></div>
          </div>
          
          <main className="absolute top-20 sm:top-20 md:top-24 left-0 right-0 bottom-0 flex items-stretch justify-center">
            <section className="flex flex-col w-full max-w-7xl mx-auto px-2 sm:px-4 h-full overflow-y-auto">
              {/* DATA STREAM */}
              <div className="terminal-panel w-full h-24 sm:h-28 md:h-32 mb-2 sm:mb-4 overflow-hidden flex-shrink-0">
                <div className="terminal-header flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Zap size={16} />
                    DATA STREAM
                  </span>
                  <div className="flex gap-2">
                    <div className="h-2 w-2 rounded-full bg-neon-tertiary"></div>
                    <div className="h-2 w-2 rounded-full bg-neon-secondary"></div>
                    <div className="h-2 w-2 rounded-full bg-neon-primary"></div>
                  </div>
                </div>
                <div className="terminal-content h-full overflow-y-auto pb-4">
                  <EventLog events={events} />
                </div>
              </div>
              
              {/* AI Audio Waveform Visualizer or Character Selection */}
              <div className="terminal-panel w-full flex-grow mb-2 sm:mb-4 min-h-0">
                <div className="terminal-header flex items-center justify-between">
                  {/* Title changes based on mode and provider */}
                  {!currentSession.isSessionActive && isCharacterSelectionMode ? (
                    <>
                      <span className="flex items-center gap-2">
                        <User size={16} className="text-neon-primary" />
                        <span className="hidden sm:inline">PERSONA SELECTION ({currentProviderType.toUpperCase()})</span>
                        <span className="sm:hidden">PERSONA ({currentProviderType.toUpperCase()})</span>
                      </span>
                      <div className="text-xs opacity-70 hidden sm:block">[SELECT CHARACTER TO CONTINUE]</div>
                    </>
                  ) : (
                    <>
                      <span className="flex items-center gap-2">
                        <Activity size={16} className="text-neon-primary" />
                        <span className="hidden sm:inline">AUDIO VISUALIZATION ({currentProviderType.toUpperCase()})</span>
                        <span className="sm:hidden">AUDIO ({currentProviderType.toUpperCase()})</span>
                      </span>
                      <div className={`text-xs ${audioRecording.isRecordingCurrentResponse ? "text-neon-primary animate-pulse" : "opacity-50"}`}>
                        {audioRecording.isRecordingCurrentResponse ? "TRANSMITTING" : "IDLE"}
                      </div>
                    </>
                  )}
                </div>
                <div className="terminal-content h-full relative">
                  {!currentSession.isSessionActive && isCharacterSelectionMode ? (
                    <CharacterSelect onSelectCharacter={handleSelectCharacter} currentProvider={currentProviderType} />
                  ) : currentProviderType === 'openai' && currentSession.audioElement.current && currentSession.audioElement.current.srcObject ? (
                    // OpenAI audio visualization (existing logic)
                    <>
                      <WaveformVisualizer 
                        audioStream={currentSession.audioElement.current.srcObject} 
                        isMicMuted={currentSession.isMicMuted}
                        toggleMicMute={currentSession.toggleMicMute}
                      />
                      
                      {/* Unified Export buttons for OpenAI */}
                      <div className="absolute top-4 right-4 flex gap-2">
                        <button
                          onClick={() => audioExport.exportLastAudio(unifiedAudioCapture.lastResponseAudio, selectedCharacter)}
                          disabled={audioExport.isExporting || !unifiedAudioCapture.lastResponseAudio}
                          className={`terminal-button flex items-center gap-2 px-3 py-2 ${
                            audioExport.isExporting || !unifiedAudioCapture.lastResponseAudio ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                          title="Export last AI response"
                        >
                          <Save size={16} className="text-neon-secondary" />
                          <span className="text-neon-secondary">EXPORT LAST</span>
                        </button>
                        
                        <button
                          onClick={() => audioExport.exportFullAudio(unifiedAudioCapture.fullConversationAudio, selectedCharacter)}
                          disabled={audioExport.isExporting || !unifiedAudioCapture.fullConversationAudio}
                          className={`terminal-button flex items-center gap-2 px-3 py-2 ${
                            audioExport.isExporting || !unifiedAudioCapture.fullConversationAudio ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                          title="Export full conversation"
                        >
                          <Download size={16} className="text-neon-primary" />
                          <span className="text-neon-primary">EXPORT FULL</span>
                        </button>
                      </div>
                      
                      {/* Export status message */}
                      {audioExport.exportStatus && (
                        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-cyber-dark border border-neon-primary px-4 py-2 rounded-sm text-neon-primary text-sm">
                          {audioExport.exportStatus}
                        </div>
                      )}
                    </>
                  ) : currentProviderType === 'gemini' && currentSession.isSessionActive ? (
                    // Gemini audio visualization
                    <>
                      {pcmPlayer.analyserNode ? (
                        <WaveformVisualizer 
                          analyserNode={pcmPlayer.analyserNode}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-neon-secondary">
                          Gemini Audio Session Active (Initializing Visualizer...)
                        </div>
                      )}
                      
                      {/* Unified Export buttons for Gemini */}
                      <div className="absolute top-4 right-4 flex gap-2">
                        <button
                          onClick={() => audioExport.exportWavAudio(unifiedAudioCapture.lastResponseAudio, 'last', selectedCharacter)}
                          disabled={audioExport.isExporting || !unifiedAudioCapture.lastResponseAudio}
                          className={`terminal-button flex items-center gap-2 px-3 py-2 ${
                            audioExport.isExporting || !unifiedAudioCapture.lastResponseAudio ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                          title="Export last AI response"
                        >
                          <Save size={16} className="text-neon-secondary" />
                          <span className="text-neon-secondary">EXPORT LAST</span>
                        </button>
                        
                        <button
                          onClick={() => {
                            const fullConversationWav = unifiedAudioCapture.getFullConversationPcmAsWav();
                            if (fullConversationWav) {
                              audioExport.exportWavAudio(fullConversationWav, 'full', selectedCharacter);
                            }
                          }}
                          disabled={audioExport.isExporting || !unifiedAudioCapture.getFullConversationPcmAsWav()}
                          className={`terminal-button flex items-center gap-2 px-3 py-2 ${
                            audioExport.isExporting || !unifiedAudioCapture.getFullConversationPcmAsWav() ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                          title="Export full conversation"
                        >
                          <Download size={16} className="text-neon-primary" />
                          <span className="text-neon-primary">EXPORT FULL</span>
                        </button>
                      </div>
                      
                      {/* Export status message */}
                      {audioExport.exportStatus && (
                        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-cyber-dark border border-neon-primary px-4 py-2 rounded-sm text-neon-primary text-sm">
                          {audioExport.exportStatus}
                        </div>
                      )}
                    </>
                  ) : !currentSession.isSessionActive && selectedCharacter ? (
                    <div className="flex flex-col items-center justify-center h-full">
                      <div className="terminal-panel p-6 border-neon-primary max-w-md">
                        <div className="terminal-header flex items-center justify-between mb-4">
                          <span className="flex items-center gap-2 text-neon-primary">
                            <User size={18} />
                            <span className="text-lg">SELECTED PERSONA</span>
                          </span>
                          <div className="h-2 w-2 rounded-full bg-neon-primary"></div>
                        </div>
                        <div className="flex flex-col gap-4">
                          <div className="text-2xl text-neon-primary">{selectedCharacter.name}</div>
                          <div className="text-md opacity-80">{selectedCharacter.description}</div>
                          <div className="text-sm opacity-60 flex flex-col gap-2 mt-2">
                            <div className="flex justify-between">
                              <span>VOICE MODEL:</span>
                              <span className="text-neon-secondary">{selectedCharacter.voice.toUpperCase()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>TEMPERATURE:</span>
                              <span className={`${
                                selectedCharacter.temperature < 0.4 ? "text-blue-400" :
                                selectedCharacter.temperature < 0.7 ? "text-cyan-400" :
                                selectedCharacter.temperature < 1.0 ? "text-yellow-400" :
                                "text-red-400"
                              }`}>{selectedCharacter.temperature.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>PERSONA TYPE:</span>
                              <span className="text-neon-tertiary">{selectedCharacter.promptName}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-center mt-6">
                          <button
                            onClick={handleBackToCharacterSelect}
                            className="terminal-button flex items-center gap-2 px-4 py-2"
                          >
                            <Terminal className="text-neon-tertiary" size={16} />
                            <span className="text-neon-tertiary">CHANGE PERSONA</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              
              {/* Command Interface */}
              <div className="terminal-panel w-full h-24 sm:h-28 md:h-32 flex-shrink-0">
                <div className="terminal-header flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Terminal size={16} />
                    <span className="hidden sm:inline">COMMAND INTERFACE ({currentProviderType.toUpperCase()})</span>
                    <span className="sm:hidden">COMMAND ({currentProviderType.toUpperCase()})</span>
                  </span>
                  <div className="text-xs opacity-70">[{currentSession.isSessionActive ? "ONLINE" : "OFFLINE"}]</div>
                </div>
                <div className="terminal-content h-full">
                  <SessionControls
                    startSession={startSession}
                    stopSession={stopSession}
                    sendClientEvent={sendClientEvent} 
                    sendTextMessage={sendTextMessage}
                    events={events}
                    isSessionActive={currentSession.isSessionActive}
                    currentProvider={currentProviderType}
                    isUserAudioStreaming={pcmStreamer.isStreaming}
                    onStartUserAudioStream={handleStartUserAudioStream}
                    onStopUserAudioStream={handleStopUserAudioStream}
                  />
                </div>
              </div>
            </section>
          </main>
        </>
      )}
    </div>
  );
}
