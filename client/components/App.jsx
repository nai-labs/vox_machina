import { useEffect, useRef, useState } from "react";
import logo from "/assets/vox-machina-logo.png";
import EventLog from "./EventLog";
import SessionControls from "./SessionControls";
import WaveformVisualizer from "./WaveformVisualizer";
import CharacterSelect from "./CharacterSelect";
import SplashScreen from "./SplashScreen";
import { Download, Cpu, Terminal, Zap, AlertTriangle, Activity, User } from "react-feather";
import { getCharacterById } from "../utils/characterData";

export default function App() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [events, setEvents] = useState([]);
  const [dataChannel, setDataChannel] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState(null);
  const [lastAudioResponse, setLastAudioResponse] = useState(null);
  const [lastMessageAudio, setLastMessageAudio] = useState(null);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [isCharacterSelectionMode, setIsCharacterSelectionMode] = useState(true);
  const [showSplashScreen, setShowSplashScreen] = useState(true);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const peerConnection = useRef(null);
  const audioElement = useRef(null);
  const micTrackRef = useRef(null);
  const isAISpeakingRef = useRef(false);
  const isSessionInitializedRef = useRef(false);
  const firstExportTimeoutRef = useRef(null);
  const hasExportedRef = useRef(false);
  
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
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            // Always add to full conversation audio
            audioChunksRef.current.push(event.data);
            
            // Only add to current message audio if AI is speaking
            if (isAISpeakingRef.current) {
              currentMessageChunksRef.current.push(event.data);
              console.log("Added chunk to current message audio (AI speaking)");
            } else {
              console.log("Skipped adding chunk to current message audio (AI not speaking)");
            }
            
            console.log("Audio data received", event.data.size, "total chunks:", audioChunksRef.current.length);
            
            // Create and update the full audio response
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            setLastAudioResponse(audioBlob);
            console.log("Updated lastAudioResponse with new data", audioBlob.size);
            
            // Only update the current message audio if we have chunks and AI is speaking
            if (currentMessageChunksRef.current.length > 0) {
              const messageBlob = new Blob(currentMessageChunksRef.current, { type: 'audio/webm' });
              setLastMessageAudio(messageBlob);
              console.log("Updated lastMessageAudio with new data", messageBlob.size);
            }
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
        
        // Create listeners for speech activity
        audioElement.current.onplay = () => {
          console.log("AI started speaking");
          isAISpeakingRef.current = true; // Update ref immediately (synchronous)
          setIsAISpeaking(true); // Update state for UI (asynchronous)
          // When AI starts speaking for a new response, we should already have
          // cleared the current message chunks when response.create was received
          console.log("Current message chunks length at start of speech:", currentMessageChunksRef.current.length);
        };
        
        audioElement.current.onpause = () => {
          console.log("AI stopped speaking");
          isAISpeakingRef.current = false; // Update ref immediately (synchronous)
          setIsAISpeaking(false); // Update state for UI (asynchronous)
          // When AI stops speaking, finalize the current message audio
          console.log("Current message chunks length at end of speech:", currentMessageChunksRef.current.length);
          if (currentMessageChunksRef.current.length > 0) {
            const messageBlob = new Blob(currentMessageChunksRef.current, { type: 'audio/webm' });
            setLastMessageAudio(messageBlob);
            console.log("Finalized message audio on pause", messageBlob.size);
          } else {
            console.log("No chunks to finalize for lastMessageAudio on pause");
          }
          // Request data to ensure we have the latest audio
          mediaRecorder.requestData();
        };
        
        // Listen for new audio responses via data channel to know when to save audio
        if (dataChannel) {
          const originalOnOpen = dataChannel.onopen;
          dataChannel.onopen = (e) => {
            if (originalOnOpen) originalOnOpen(e);
            
            dataChannel.addEventListener("message", (event) => {
              const data = JSON.parse(event.data);
              
              // Detect when the model stops speaking (response is done)
              if (data.type === "response.done") {
                console.log("Response completed, requesting audio data");
                mediaRecorder.requestData();
              }
            });
          };
        }
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
    
    // Set up MediaRecorder for user audio
    try {
      const userMediaRecorder = new MediaRecorder(ms);
      userMediaRecorderRef.current = userMediaRecorder;
      userAudioChunksRef.current = [];
      
      userMediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          userAudioChunksRef.current.push(event.data);
          console.log("User audio data received", event.data.size, "total user chunks:", userAudioChunksRef.current.length);
        }
      };
      
      userMediaRecorder.onstop = () => {
        console.log("User media recorder stopped");
      };
      
      // Start recording user audio
      userMediaRecorder.start(5000);
      console.log("User media recorder started");
    } catch (err) {
      console.error("Failed to set up user media recorder:", err);
    }

    // Set up data channel for sending and receiving events
    const dc = pc.createDataChannel("oai-events");
    setDataChannel(dc);

    // Reset session state
    isSessionInitializedRef.current = false;
    hasExportedRef.current = false;
    
    // Clear any existing first export timeout
    if (firstExportTimeoutRef.current) {
      clearTimeout(firstExportTimeoutRef.current);
    }

    // Start the session using the Session Description Protocol (SDP)
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const baseUrl = "https://api.openai.com/v1/realtime";
    const model = "gpt-4o-realtime-preview-2024-12-17";
    const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
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
  // User audio MediaRecorder reference
  const userMediaRecorderRef = useRef(null);
  // User audio chunks storage
  const userAudioChunksRef = useRef([]);

  // Stop current session, clean up peer connection and data channel
  function stopSession() {
    if (dataChannel) {
      dataChannel.close();
    }

    // Stop any active media recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    // Stop user media recorder
    if (userMediaRecorderRef.current && userMediaRecorderRef.current.state !== 'inactive') {
      userMediaRecorderRef.current.stop();
    }

    // Clear any pending first export timeout
    if (firstExportTimeoutRef.current) {
      clearTimeout(firstExportTimeoutRef.current);
      firstExportTimeoutRef.current = null;
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
    userMediaRecorderRef.current = null;
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

  // Function to export the recorded audio
  async function exportAudio(isFirstExport = false) {
    console.log(`Auto-saving conversation - EXPORT TRIGGERED (${isFirstExport ? 'FIRST EXPORT' : 'REGULAR EXPORT'})`);
    
    // Mark that we've attempted an export
    hasExportedRef.current = true;
    
    // For first export, we might not have lastAudioResponse yet, so create one from chunks
    if (isFirstExport && !lastAudioResponse && audioChunksRef.current.length > 0) {
      console.log("Creating audio response for first export from chunks");
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      setLastAudioResponse(audioBlob);
    }
    
    // Check if we have audio data to export
    if (!lastAudioResponse && audioChunksRef.current.length === 0) {
      console.log("No audio response available to export");
      return;
    }

    console.log("Audio data available, proceeding with export");
    console.log("Audio chunks count:", audioChunksRef.current.length);
    console.log("User audio chunks count:", userAudioChunksRef.current.length);

    try {
      setIsExporting(true);

      // Request final chunks from both recorders
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        console.log("Requesting final AI audio data");
        mediaRecorderRef.current.requestData();
      }
      if (userMediaRecorderRef.current && userMediaRecorderRef.current.state !== 'inactive') {
        console.log("Requesting final user audio data");
        userMediaRecorderRef.current.requestData();
      }

      // Short delay to ensure we have the latest data after requestData
      await new Promise(resolve => setTimeout(resolve, 500));

      // Convert AI audio blob to base64
      const aiAudioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      console.log("AI audio blob size:", aiAudioBlob.size);
      
      if (aiAudioBlob.size === 0) {
        console.log("AI audio blob is empty, aborting export");
        setIsExporting(false);
        return;
      }
      
      const aiReader = new FileReader();
      aiReader.readAsDataURL(aiAudioBlob);
      
      aiReader.onloadend = async () => {
        try {
          let aiBase64data = aiReader.result;
          
          // Check if the AI data is too large
          if (aiBase64data.length > 10000000) { // ~10MB limit
            console.log("AI audio data is too large, trimming to last 10MB");
            aiBase64data = aiBase64data.substring(aiBase64data.length - 10000000);
          }
          
          // Convert user audio blob to base64
          const userAudioBlob = new Blob(userAudioChunksRef.current, { type: 'audio/webm' });
          const userReader = new FileReader();
          userReader.readAsDataURL(userAudioBlob);
          
          userReader.onloadend = async () => {
            try {
              let userBase64data = userReader.result;
              
              // Check if the user data is too large
              if (userBase64data.length > 10000000) { // ~10MB limit
                console.log("User audio data is too large, trimming to last 10MB");
                userBase64data = userBase64data.substring(userBase64data.length - 10000000);
              }
              
              console.log("Sending AI audio data, length:", aiBase64data.length);
              console.log("Sending user audio data, length:", userBase64data.length);
              
              // Send both audio streams to server
              const response = await fetch('/save-audio', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                  aiAudioData: aiBase64data,
                  userAudioData: userBase64data,
                  isRecentMessage: false,
                  includeUserAudio: true
                }),
              });
              
              console.log("Server response status:", response.status);
              
              let result;
              try {
                const responseText = await response.text();
                console.log("Response text preview:", responseText.substring(0, 100));
                
                try {
                  result = JSON.parse(responseText);
                } catch (e) {
                  console.error("Failed to parse response as JSON:", e);
                  throw new Error(`Server returned invalid JSON: ${responseText.substring(0, 200)}`);
                }
              } catch (e) {
                console.error("Error reading response:", e);
                throw e;
              }
              
              if (result.success) {
                console.log(`Audio auto-saved as ${result.combined ? result.combined.filename : result.webm.filename}`);
              } else {
                console.error("Server returned error:", result.error);
                throw new Error(result.error || "Failed to save audio");
              }
            } catch (error) {
              console.error("Error processing user audio:", error);
            } finally {
              setIsExporting(false);
            }
          };
          
          userReader.onerror = () => {
            console.error("Error reading user audio data");
            setIsExporting(false);
          };
          
        } catch (error) {
          console.error("Error processing AI audio:", error);
          setIsExporting(false);
        }
      };
      
      aiReader.onerror = () => {
        console.error("Error reading AI audio data");
        setIsExporting(false);
      };
    } catch (error) {
      console.error("Error exporting audio:", error);
      setIsExporting(false);
    }
  }

  // Attach event listeners to the data channel when a new one is created
  useEffect(() => {
    if (dataChannel) {
      // Append new server events to the list
      dataChannel.addEventListener("message", (e) => {
        const eventData = JSON.parse(e.data);
        setEvents((prev) => [eventData, ...prev]);
        
        // When a new response starts, reset the current message audio collection
        if (eventData.type === "response.create") {
          console.log("New response started, resetting current message audio");
          currentMessageChunksRef.current = [];
          console.log("Current message chunks length after reset:", currentMessageChunksRef.current.length);
        }
        
        // When the model stops speaking (response is done), finalize the current message audio
        // and trigger auto-export
        if (eventData.type === "response.done") {
          console.log("Response completed, finalizing current message audio");
          console.log("Current message chunks length:", currentMessageChunksRef.current.length);
          
          // Always request the latest audio data
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            console.log("Requesting final audio data before export");
            mediaRecorderRef.current.requestData();
          }
          
          // Create a blob from current message chunks if available
          if (currentMessageChunksRef.current.length > 0) {
            const messageBlob = new Blob(currentMessageChunksRef.current, { type: 'audio/webm' });
            setLastMessageAudio(messageBlob);
            console.log("Finalized lastMessageAudio", messageBlob.size);
          } else {
            console.log("No chunks to finalize for lastMessageAudio");
          }
          
          // Only auto-export if the session is fully initialized
          if (isSessionInitializedRef.current) {
            // Auto-export the conversation after each turn with a longer delay
            console.log("Scheduling auto-export in 3 seconds");
            setTimeout(() => {
              console.log("Auto-export timer triggered");
              exportAudio();
            }, 3000); // Longer delay to ensure all audio is processed
          } else {
            console.log("Skipping auto-export - session not fully initialized yet");
          }
        }
        
        // Look for audio output events to save audio
        if (eventData.type === "audio_output.delta" || eventData.type === "audio_output") {
          console.log("Audio event received:", eventData.type);
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
          
          // Schedule first export after 10 seconds to ensure we have at least one export
          firstExportTimeoutRef.current = setTimeout(() => {
            console.log("Triggering first automatic export");
            if (!hasExportedRef.current) {
              exportAudio(true); // Pass true to indicate this is the first export
            }
          }, 10000);
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
                      <div className={`text-xs ${isAISpeaking ? "text-neon-primary animate-pulse" : "opacity-50"}`}>
                        {isAISpeaking ? "TRANSMITTING" : "IDLE"}
                      </div>
                    </>
                  )}
                </div>
                <div className="terminal-content h-full">
                  {!isSessionActive && isCharacterSelectionMode ? (
                    <CharacterSelect onSelectCharacter={handleSelectCharacter} />
                  ) : audioElement.current && audioElement.current.srcObject ? (
                    <WaveformVisualizer 
                      audioStream={audioElement.current.srcObject} 
                      isAISpeaking={isAISpeaking}
                      isMicMuted={isMicMuted}
                      toggleMicMute={toggleMicMute}
                    />
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
