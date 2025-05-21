import { useEffect, useRef, useState } from "react";
import logo from "/assets/vox-machina-logo.png";
import EventLog from "./EventLog";
import SessionControls from "./SessionControls";
import WaveformVisualizer from "./WaveformVisualizer";
import CharacterSelect from "./CharacterSelect";
import SplashScreen from "./SplashScreen";
import { Download, Cpu, Terminal, Zap, AlertTriangle, Activity, User, Save } from "react-feather";
import { getCharacterById } from "../utils/characterData";

export default function App() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [events, setEvents] = useState([]);
  const [dataChannel, setDataChannel] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState(null);
  const [lastAudioResponse, setLastAudioResponse] = useState(null);
  const [lastMessageAudio, setLastMessageAudio] = useState(null);
  // Removed isAISpeaking state
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [isCharacterSelectionMode, setIsCharacterSelectionMode] = useState(true);
  const [showSplashScreen, setShowSplashScreen] = useState(true);
  const [isRecordingCurrentResponse, setIsRecordingCurrentResponse] = useState(false); // Added state
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [apiModelName, setApiModelName] = useState(null); // State for API model name
  const peerConnection = useRef(null);
  const audioElement = useRef(null);
  const micTrackRef = useRef(null);
  // Removed isAISpeakingRef
  const isSessionInitializedRef = useRef(false);
  
  // Store all AI audio responses for the session
  const audioResponsesHistoryRef = useRef([]);
  
  // Toggle microphone mute state
  function toggleMicMute() {
    if (micTrackRef.current) {
      const newMuteState = !isMicMuted;
      micTrackRef.current.enabled = !newMuteState;
      setIsMicMuted(newMuteState);
      console.log(`Microphone ${newMuteState ? 'muted' : 'unmuted'}`);
    }
  }

  function handleSelectCharacter(character) {
    setSelectedCharacter(character);
    setIsCharacterSelectionMode(false);
  }
  
  function handleBackToCharacterSelect() {
    setIsCharacterSelectionMode(true);
  }
  
  async function startSession() {
    if (!selectedCharacter) {
      console.error("No character selected");
      return;
    }
    
    console.log("Starting session with character:", selectedCharacter);
    console.log("Temperature:", selectedCharacter.temperature);
    console.log("Voice:", selectedCharacter.voice);
    
    // Get an ephemeral key from the Fastify server with the selected character and parameters
    const tokenUrl = `/token?character=${selectedCharacter.id}&temperature=${selectedCharacter.temperature}${selectedCharacter.voice ? `&voice=${selectedCharacter.voice}` : ''}`;
    console.log("Token URL:", tokenUrl);
    
    const tokenResponse = await fetch(tokenUrl);
    const data = await tokenResponse.json();
    const EPHEMERAL_KEY = data.client_secret.value;

    // Set the API model name from the token response
    if (data.apiModel) {
      setApiModelName(data.apiModel);
      console.log("Using API Model from server:", data.apiModel);
    } else {
      // Fallback if not provided by server (should ideally not happen if server.js is updated)
      const DEFAULT_CLIENT_MODEL = "gpt-4o-realtime-preview-2024-12-17";
      setApiModelName(DEFAULT_CLIENT_MODEL);
      console.warn(`API Model not received from server. Using client-side default: ${DEFAULT_CLIENT_MODEL}`);
    }

    // Create a peer connection
    const pc = new RTCPeerConnection();

    // Set up to play remote audio from the model
    audioElement.current = document.createElement("audio");
    audioElement.current.autoplay = true;
    
    pc.ontrack = (e) => {
      console.log("Received track from model");
      const stream = e.streams[0];
      audioElement.current.srcObject = stream;
      
      // Set up a simple MediaRecorder directly on the stream
      try {
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        // Initialize or clear audio chunks
        audioChunksRef.current = [];
        // Clear audio responses history
        audioResponsesHistoryRef.current = [];
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            // Always add to full conversation audio
            audioChunksRef.current.push(event.data);
            
            // Only add to current message audio if recording the current response
            if (isRecordingCurrentResponse) { // Changed condition
              currentMessageChunksRef.current.push(event.data);
              console.log(`[DEBUG] Added chunk (${event.data.size} bytes) to currentMessageChunksRef. Total chunks: ${currentMessageChunksRef.current.length}`); // DEBUG
            } else {
              // console.log("Skipped adding chunk to current message audio (not recording response)"); // Reduced logging noise
            }
            
            // console.log("Audio data received", event.data.size, "total chunks:", audioChunksRef.current.length); // Reduced logging noise
            
            // Create and update the full audio response
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            setLastAudioResponse(audioBlob);
            // console.log("Updated lastAudioResponse with new data", audioBlob.size); // Reduced logging noise
            
            // Only update the current message audio if we have chunks and AI is speaking
            // This check seems redundant now as setLastMessageAudio is handled on response.done
            // if (currentMessageChunksRef.current.length > 0) {
            //   const messageBlob = new Blob(currentMessageChunksRef.current, { type: 'audio/webm' });
            //   setLastMessageAudio(messageBlob);
            //   console.log("Updated lastMessageAudio with new data", messageBlob.size);
            // }
          }
        };
        
        mediaRecorder.onstop = () => {
          if (audioChunksRef.current.length > 0) {
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            setLastAudioResponse(audioBlob);
            console.log("Media recorder stopped, saved blob", audioBlob.size);
          }
        };
        
        // Start recording and request data every 5 seconds
        mediaRecorder.start(5000);
        console.log("Media recorder started");
        
        // Removed onplay/onpause listeners for speech activity
        
      } catch (err) {
        console.error("Failed to set up media recorder:", err);
      }
    };

    // Add local audio track for microphone input in the browser
    const ms = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    const micTrack = ms.getTracks()[0];
    micTrackRef.current = micTrack; // Store reference for mute control
    pc.addTrack(micTrack);

    // Set up data channel for sending and receiving events
    const dc = pc.createDataChannel("oai-events");
    setDataChannel(dc);

    // Reset session state
    isSessionInitializedRef.current = false;
    
    // Start the session using the Session Description Protocol (SDP)
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const baseUrl = "https://api.openai.com/v1/realtime";
    // Use the model name from the token response, or fallback
    const modelToUse = data.apiModel || apiModelName || "gpt-4o-realtime-preview-2024-12-17";
    if (!data.apiModel) {
      // This warning is slightly redundant if the earlier block already warned,
      // but good for confirming the fallback is active at point of use.
      console.warn(`Using fallback model for SDP negotiation: ${modelToUse}`);
    }
    
    const sdpResponse = await fetch(`${baseUrl}?model=${modelToUse}`, {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${EPHEMERAL_KEY}`,
        "Content-Type": "application/sdp",
      },
    });

    const answer = {
      type: "answer",
      sdp: await sdpResponse.text(),
    };
    await pc.setRemoteDescription(answer);

    peerConnection.current = pc;
  }

  // MediaRecorder reference
  const mediaRecorderRef = useRef(null);
  // Audio chunks storage
  const audioChunksRef = useRef([]);
  // Current message chunks storage
  const currentMessageChunksRef = useRef([]);

  // Stop current session, clean up peer connection and data channel
  function stopSession() {
    if (dataChannel) {
      dataChannel.close();
    }

    // Stop any active media recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    peerConnection.current.getSenders().forEach((sender) => {
      if (sender.track) {
        sender.track.stop();
      }
    });

    if (peerConnection.current) {
      peerConnection.current.close();
    }

    setIsSessionActive(false);
    setDataChannel(null);
    peerConnection.current = null;
    
    // Clear audio responses history when session ends
    audioResponsesHistoryRef.current = [];
  }

  // Send a message to the model
  function sendClientEvent(message) {
    if (dataChannel) {
      message.event_id = message.event_id || crypto.randomUUID();
      dataChannel.send(JSON.stringify(message));
      setEvents((prev) => [message, ...prev]);
    } else {
      console.error(
        "Failed to send message - no data channel available",
        message,
      );
    }
  }

  // Send a text message to the model
  function sendTextMessage(message) {
    const event = {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: message,
          },
        ],
      },
    };

    sendClientEvent(event);
    sendClientEvent({ type: "response.create" });
  }

  // Generic function to export an audio blob
  async function exportAudioBlob(audioBlob, exportType, filenamePrefix) {
    if (!audioBlob || audioBlob.size === 0) {
      console.log(`No audio data to export for type: ${exportType}`);
      setExportStatus("No audio to export");
      setTimeout(() => setExportStatus(null), 3000);
      return;
    }

    setIsExporting(true);
    setExportStatus(`Exporting ${exportType === 'last' ? 'last response' : 'full conversation'}...`);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);

      reader.onloadend = async () => {
        try {
          let base64data = reader.result;
          if (!base64data) {
            throw new Error("FileReader resulted in null or undefined data.");
          }

          // For 'full' export, check if the data is too large (optional, as per original logic)
          if (exportType === 'full' && base64data.length > 10000000) { // ~10MB limit
            console.log("Audio data for 'full' export is too large, trimming to last 10MB of data.");
            // This substring logic might not be ideal for binary data, but replicates existing behavior.
            // A more robust solution would be to handle this server-side or by re-encoding.
            base64data = base64data.substring(base64data.length - 10000000);
          }
          
          console.log(`Sending ${exportType} audio data to /save-audio. Length: ${base64data.length}`);

          const response = await fetch('/save-audio', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              audioData: base64data,
              exportType: exportType,
              // filenamePrefix: filenamePrefix // Server can use this if needed
            }),
          });

          const result = await response.json();
          console.log(`Server response for ${exportType} export:`, result);

          if (result.success && result.mp3 && result.mp3.filename) {
            console.log(`${exportType === 'last' ? 'Last audio response' : 'Full audio conversation'} saved as ${result.mp3.filename}`);
            setExportStatus(`Saved as ${result.mp3.filename}`);
            setTimeout(() => setExportStatus(null), 3000);
          } else {
            console.error(`Server returned error for ${exportType} export:`, result.error);
            setExportStatus(`Export failed: ${result.error || 'Unknown server error'}`);
            setTimeout(() => setExportStatus(null), 5000);
          }
        } catch (error) {
          console.error(`Error processing audio or fetching for ${exportType} export:`, error);
          setExportStatus(`Export failed: ${error.message}`);
          setTimeout(() => setExportStatus(null), 5000);
        } finally {
          setIsExporting(false);
        }
      };

      reader.onerror = (error) => {
        console.error(`FileReader error for ${exportType} export:`, error);
        setIsExporting(false);
        setExportStatus("Export failed: Client-side file reading error");
        setTimeout(() => setExportStatus(null), 5000);
      };
    } catch (error) {
      console.error(`Error in exportAudioBlob for ${exportType}:`, error);
      setIsExporting(false);
      setExportStatus(`Export failed: ${error.message}`);
      setTimeout(() => setExportStatus(null), 5000);
    }
  }

  // Function to export the last AI audio response
  async function exportLastAudio() {
    console.log("Attempting to export last audio response...");
    if (!lastMessageAudio || lastMessageAudio.size === 0) {
      console.log("No last message audio available or size is 0 for export.");
      setExportStatus("No audio to export");
      setTimeout(() => setExportStatus(null), 3000);
      return;
    }
    // The filename prefix can be customized if needed, or handled by the server based on exportType
    await exportAudioBlob(lastMessageAudio, 'last', 'last_ai_response');
  }

  // Function to export all AI audio responses
  async function exportFullAudio() {
    console.log("Attempting to export full AI audio conversation...");
    if (!lastAudioResponse || lastAudioResponse.size === 0) {
      console.log("No full conversation audio available or size is 0 for export.");
      setExportStatus("No audio to export");
      setTimeout(() => setExportStatus(null), 3000); // Changed to return early like exportLastAudio
      return;
    }
    // The filename prefix can be customized if needed
    await exportAudioBlob(lastAudioResponse, 'full', 'full_ai_conversation');
  }

  // Attach event listeners to the data channel when a new one is created
  useEffect(() => {
    if (dataChannel) {
      // Append new server events to the list
      dataChannel.addEventListener("message", (e) => {
        const eventData = JSON.parse(e.data);
        setEvents((prev) => [eventData, ...prev]);
        
        // When a new response starts, reset the current message audio collection and start recording it
        if (eventData.type === "response.create") {
          console.log("New response started (response.create), resetting current message audio and starting recording");
          currentMessageChunksRef.current = [];
          setIsRecordingCurrentResponse(true); // Start recording current response
          console.log("Current message chunks length after reset:", currentMessageChunksRef.current.length);
        }
        
        // When the model stops speaking (response is done), finalize the current message audio
        if (eventData.type === "response.done") {
          console.log("Response completed (response.done), finalizing current message audio");
          setIsRecordingCurrentResponse(false); // Stop recording current response
          
          // Request final audio data to ensure all chunks are captured before creating the blob
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            console.log("Requesting final audio data for last message before finalizing blob.");
            mediaRecorderRef.current.requestData();
          }
          
          // Add a short delay to allow final data chunk to arrive (if any are pending from natural recorder interval)
          setTimeout(() => {
            console.log("[DEBUG] Finalizing blob after delay. Current message chunks length:", currentMessageChunksRef.current.length); // DEBUG
            // Create a blob from current message chunks if available
            if (currentMessageChunksRef.current.length > 0) {
              const messageBlob = new Blob(currentMessageChunksRef.current, { type: 'audio/webm' });
              console.log("[DEBUG] Created messageBlob, size:", messageBlob.size); // DEBUG
              setLastMessageAudio(messageBlob);
              console.log("[DEBUG] Called setLastMessageAudio with blob:", messageBlob); // DEBUG
              
              // Add to audio responses history
              audioResponsesHistoryRef.current.push(messageBlob);
              console.log("Added response to history, total responses:", audioResponsesHistoryRef.current.length);
            } else {
              console.log("[DEBUG] No chunks to finalize for lastMessageAudio"); // DEBUG
            }
          }, 100); // 100ms delay
        }
        
        // Look for audio output events (optional logging)
        if (eventData.type === "audio_output.delta" || eventData.type === "audio_output") {
          // console.log("Audio event received:", eventData.type); // Reduced logging noise
        }
      });

      // Set session active when the data channel is opened
      dataChannel.addEventListener("open", () => {
        console.log("Data channel opened");
        setIsSessionActive(true);
        setEvents([]);
        
        // Initialize current message chunks
        currentMessageChunksRef.current = [];
        
        // Mark session as initialized after a short delay to ensure everything is ready
        setTimeout(() => {
          console.log("Session fully initialized");
          isSessionInitializedRef.current = true;
        }, 2000);
      });
    }
  }, [dataChannel]);

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
          
          {/* We've replaced this with the animated floating particles overlay above */}
          
          <main className="absolute top-20 left-0 right-0 bottom-0 flex items-center justify-center">
            <section className="absolute top-0 left-0 right-0 bottom-0 flex flex-col max-w-7xl mx-auto px-4 w-full">
              {/* DATA STREAM - Now smaller */}
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
                  {!isSessionActive && isCharacterSelectionMode ? (
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
                      {/* Changed condition to use isRecordingCurrentResponse */}
                      <div className={`text-xs ${isRecordingCurrentResponse ? "text-neon-primary animate-pulse" : "opacity-50"}`}>
                        {isRecordingCurrentResponse ? "TRANSMITTING" : "IDLE"}
                      </div>
                    </>
                  )}
                </div>
                <div className="terminal-content h-full relative">
                  {!isSessionActive && isCharacterSelectionMode ? (
                    <CharacterSelect onSelectCharacter={handleSelectCharacter} />
                  ) : audioElement.current && audioElement.current.srcObject ? (
                    <>
                      <WaveformVisualizer 
                        audioStream={audioElement.current.srcObject} 
                        // Removed isAISpeaking prop
                        isMicMuted={isMicMuted}
                        toggleMicMute={toggleMicMute}
                      />
                      
                      {/* Export buttons */}
                      <div className="absolute top-4 right-4 flex gap-2">
                        <button
                          onClick={exportLastAudio}
                          disabled={isExporting || !lastMessageAudio}
                          className={`terminal-button flex items-center gap-2 px-3 py-2 ${
                            isExporting || !lastMessageAudio ? 'opacity-50 cursor-not-allowed' : '' // Ensure disabled state reflects !lastMessageAudio
                          }`}
                          title="Export last AI response"
                        >
                          <Save size={16} className="text-neon-secondary" />
                          <span className="text-neon-secondary">EXPORT LAST</span>
                        </button>
                        
                        <button
                          onClick={exportFullAudio}
                          disabled={isExporting || !lastAudioResponse}
                          className={`terminal-button flex items-center gap-2 px-3 py-2 ${
                            isExporting ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                          title="Export full conversation"
                        >
                          <Download size={16} className="text-neon-primary" />
                          <span className="text-neon-primary">EXPORT FULL</span>
                        </button>
                      </div>
                      
                      {/* Export status message */}
                      {exportStatus && (
                        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-cyber-dark border border-neon-primary px-4 py-2 rounded-sm text-neon-primary text-sm">
                          {exportStatus}
                        </div>
                      )}
                    </>
                  ) : !isSessionActive && selectedCharacter ? (
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
                  <div className="text-xs opacity-70">[STATUS: {isSessionActive ? "ONLINE" : "OFFLINE"}]</div>
                </div>
                <div className="terminal-content h-full">
                  <SessionControls
                    startSession={startSession}
                    stopSession={stopSession}
                    sendClientEvent={sendClientEvent}
                    sendTextMessage={sendTextMessage}
                    events={events}
                    isSessionActive={isSessionActive}
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
