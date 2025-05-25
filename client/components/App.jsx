import { useEffect, useState, useRef } from "react";
import logo from "/assets/vox-machina-logo.png";
import EventLog from "./EventLog";
import SessionControls from "./SessionControls";
import WaveformVisualizer from "./WaveformVisualizer";
import CharacterSelect from "./CharacterSelect";
import SplashScreen from "./SplashScreen";
import { Download, Cpu, Terminal, Zap, Activity, User, Save } from "react-feather";
import { useAudioRecording } from "../hooks/useAudioRecording";
import { useWebRTCSession } from "../hooks/useWebRTCSession";
import { useAudioExport } from "../hooks/useAudioExport";

export default function App() {
  const [events, setEvents] = useState([]);
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [isCharacterSelectionMode, setIsCharacterSelectionMode] = useState(true);
  const [showSplashScreen, setShowSplashScreen] = useState(true);
  
  // Track processed events to prevent duplicates
  const processedEventsRef = useRef(new Set());

  // Custom hooks
  const audioRecording = useAudioRecording();
  const webrtcSession = useWebRTCSession();
  const audioExport = useAudioExport();

  function handleSelectCharacter(character) {
    setSelectedCharacter(character);
    setIsCharacterSelectionMode(false);
  }
  
  function handleBackToCharacterSelect() {
    setIsCharacterSelectionMode(true);
  }
  
  async function startSession() {
    // Clear processed events when starting a new session
    processedEventsRef.current.clear();
    
    await webrtcSession.startSession(selectedCharacter, (stream) => {
      audioRecording.setupMediaRecorder(stream);
    });
  }

  function stopSession() {
    webrtcSession.stopSession(() => {
      audioRecording.stopRecording();
      audioRecording.clearAudioHistory();
    });
  }

  function sendClientEvent(message) {
    webrtcSession.sendClientEvent(message, setEvents);
  }

  function sendTextMessage(message) {
    webrtcSession.sendTextMessage(message, setEvents);
  }

  // Attach event listeners to the data channel when a new one is created
  useEffect(() => {
    if (webrtcSession.dataChannel) {
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

      webrtcSession.dataChannel.addEventListener("message", handleMessage);

      const handleOpen = () => {
        console.log("Data channel opened");
        webrtcSession.setIsSessionActive(true);
        setEvents([]); // Clear UI events
        processedEventsRef.current.clear(); // Clear processed event IDs on new session
        
        setTimeout(() => {
          console.log("Session fully initialized");
          webrtcSession.isSessionInitializedRef.current = true;
        }, 2000);
      };
      webrtcSession.dataChannel.addEventListener("open", handleOpen);

      // Cleanup function
      return () => {
        if (webrtcSession.dataChannel) {
          webrtcSession.dataChannel.removeEventListener("message", handleMessage);
          webrtcSession.dataChannel.removeEventListener("open", handleOpen);
        }
      };
    }
    // Ensure all dependencies that are used inside the effect and can change are listed.
    // audioRecording methods (startRecordingResponse, stopRecordingResponse) are stable due to useCallback.
    // webrtcSession methods (setIsSessionActive) and refs (isSessionInitializedRef) should be stable or handled carefully if they cause re-runs.
    // For simplicity, assuming audioRecording and webrtcSession objects themselves are stable references from their hooks.
  }, [webrtcSession.dataChannel, audioRecording, webrtcSession]);

  // Handle splash screen completion
  const handleSplashComplete = () => {
    setShowSplashScreen(false);
  };

  return (
    <div className="bg-cyber-dark text-cyber-text font-cyber">
      {showSplashScreen ? (
        <SplashScreen onComplete={handleSplashComplete} />
      ) : (
        <>
          {/* Background effects */}
          <div className="terminal-scan-line"></div>
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
          
          <nav className="absolute top-0 left-0 right-0 h-20 flex items-center z-10">
            <div className="terminal-header flex items-center justify-between gap-4 w-full m-4 pb-2 border-0 border-b border-solid border-neon-primary">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Cpu size={20} className="text-neon-primary" />
                  <Terminal size={20} className="text-neon-secondary" />
                </div>
                <h1 className="glitch-text neon-text" data-text="VOX MACHINA CONSOLE">VOX MACHINA CONSOLE</h1>
              </div>
              
              {/* Logo in header */}
              <div className="h-14 relative">
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
          
          <main className="absolute top-20 left-0 right-0 bottom-0 flex items-center justify-center">
            <section className="absolute top-0 left-0 right-0 bottom-0 flex flex-col max-w-7xl mx-auto px-4 w-full">
              {/* DATA STREAM */}
              <div className="terminal-panel w-full h-32 mb-4 overflow-hidden">
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
              <div className="terminal-panel w-full flex-grow mb-4">
                <div className="terminal-header flex items-center justify-between">
                  {!webrtcSession.isSessionActive && isCharacterSelectionMode ? (
                    <>
                      <span className="flex items-center gap-2">
                        <User size={16} className="text-neon-primary" />
                        VOX MACHINA PERSONA SELECTION
                      </span>
                      <div className="text-xs opacity-70">[SELECT A CHARACTER TO CONTINUE]</div>
                    </>
                  ) : (
                    <>
                      <span className="flex items-center gap-2">
                        <Activity size={16} className="text-neon-primary" />
                        VOX MACHINA AUDIO VISUALIZATION
                      </span>
                      <div className={`text-xs ${audioRecording.isRecordingCurrentResponse ? "text-neon-primary animate-pulse" : "opacity-50"}`}>
                        {audioRecording.isRecordingCurrentResponse ? "TRANSMITTING" : "IDLE"}
                      </div>
                    </>
                  )}
                </div>
                <div className="terminal-content h-full relative">
                  {!webrtcSession.isSessionActive && isCharacterSelectionMode ? (
                    <CharacterSelect onSelectCharacter={handleSelectCharacter} />
                  ) : webrtcSession.audioElement.current && webrtcSession.audioElement.current.srcObject ? (
                    <>
                      <WaveformVisualizer 
                        audioStream={webrtcSession.audioElement.current.srcObject} 
                        isMicMuted={webrtcSession.isMicMuted}
                        toggleMicMute={webrtcSession.toggleMicMute}
                      />
                      
                      {/* Export buttons */}
                      <div className="absolute top-4 right-4 flex gap-2">
                        <button
                          onClick={() => audioExport.exportLastAudio(audioRecording.lastMessageAudio, selectedCharacter)}
                          disabled={audioExport.isExporting || !audioRecording.lastMessageAudio}
                          className={`terminal-button flex items-center gap-2 px-3 py-2 ${
                            audioExport.isExporting || !audioRecording.lastMessageAudio ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                          title="Export last AI response"
                        >
                          <Save size={16} className="text-neon-secondary" />
                          <span className="text-neon-secondary">EXPORT LAST</span>
                        </button>
                        
                        <button
                          onClick={() => audioExport.exportFullAudio(audioRecording.lastAudioResponse, selectedCharacter)}
                          disabled={audioExport.isExporting || !audioRecording.lastAudioResponse}
                          className={`terminal-button flex items-center gap-2 px-3 py-2 ${
                            audioExport.isExporting ? 'opacity-50 cursor-not-allowed' : ''
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
                  ) : !webrtcSession.isSessionActive && selectedCharacter ? (
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
              <div className="terminal-panel w-full h-32">
                <div className="terminal-header flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Terminal size={16} />
                    COMMAND INTERFACE
                  </span>
                  <div className="text-xs opacity-70">[STATUS: {webrtcSession.isSessionActive ? "ONLINE" : "OFFLINE"}]</div>
                </div>
                <div className="terminal-content h-full">
                  <SessionControls
                    startSession={startSession}
                    stopSession={stopSession}
                    sendClientEvent={sendClientEvent}
                    sendTextMessage={sendTextMessage}
                    events={events}
                    isSessionActive={webrtcSession.isSessionActive}
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
