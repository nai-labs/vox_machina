import { useState, useEffect } from "react";
import { Zap, Power, Send, Cpu, Code, Mic, MicOff } from "react-feather"; // Added Mic, MicOff

function SessionStopped({ startSession }) {
  const [isActivating, setIsActivating] = useState(false);
  const [bootUpText, setBootUpText] = useState("");
  
  function handleStartSession() {
    if (isActivating) return;
    setIsActivating(true);
    
    // Start animation
    const bootMessages = [
      "INITIALIZING NEURAL INTERFACE",
      "ESTABLISHING SECURE CONNECTION",
      "SYNCING BIOSIGNAL PROTOCOLS",
      "LOADING QUANTUM PROCESSORS",
      "LAUNCHING AI CORE SYSTEMS"
    ];
    
    let index = 0;
    const interval = setInterval(() => {
      if (index < bootMessages.length) {
        setBootUpText(bootMessages[index]);
        index++;
      } else {
        clearInterval(interval);
        startSession();
      }
    }, 500);
  }

  return (
    <div className="flex flex-col items-center justify-center w-full h-full">
      {isActivating ? (
        <div className="flex flex-col items-center gap-4">
          <div className="text-neon-primary animate-pulse flex items-center gap-2">
            <Cpu size={18} />
            <span>{bootUpText}</span>
            <span className="animate-ping ml-1">_</span>
          </div>
          <div className="w-64 h-1 bg-cyber-light rounded overflow-hidden">
            <div className="h-full bg-neon-primary animate-pulse"></div>
          </div>
        </div>
      ) : (
        <button
          onClick={handleStartSession}
          className="terminal-button flex items-center gap-3 px-8 py-4 text-lg relative group"
          style={{
            fontSize: '1.1rem',
            fontWeight: 'bold',
            letterSpacing: '1px'
          }}
        >
          <Power className="text-neon-primary group-hover:animate-spin" size={20} />
          <span className="neon-text">INITIALIZE CONNECTION</span>
          {/* Corner decorations */}
          <span className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-neon-primary"></span>
          <span className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-neon-primary"></span>
          <span className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-neon-primary"></span>
          <span className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-neon-primary"></span>
        </button>
      )}
    </div>
  );
}

function SessionActive({ 
  stopSession, 
  sendTextMessage, 
  currentProvider,
  isUserAudioStreaming,
  onStartUserAudioStream,
  onStopUserAudioStream
}) {
  const [message, setMessage] = useState("");
  const [commandPrefix, setCommandPrefix] = useState(">");
  
  // Simulate random cyberpunk command prefixes
  useEffect(() => {
    const prefixes = ["$", ">", "#", "::", "//", "[]"];
    const interval = setInterval(() => {
      setCommandPrefix(prefixes[Math.floor(Math.random() * prefixes.length)]);
    }, 10000);
    
    return () => clearInterval(interval);
  }, []);

  function handleSendClientEvent() {
    sendTextMessage(message);
    setMessage("");
  }

  return (
    <div className="flex items-center justify-center w-full h-full gap-4">
      <div className="relative flex-1">
        <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neon-primary">
          {commandPrefix}
        </div>
        <input
          onKeyDown={(e) => {
            if (e.key === "Enter" && message.trim()) {
              handleSendClientEvent();
            }
          }}
          type="text"
          placeholder="ENTER COMMAND..."
          className="terminal-input pl-8 pr-4 py-3 w-full bg-cyber-dark border-1 
                    border-neon-primary focus:shadow-neon-primary"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>
      
      <button
        onClick={() => {
          if (message.trim()) {
            handleSendClientEvent();
          }
        }}
        className="terminal-button flex items-center gap-2 px-4 py-3"
      >
        <Send size={16} className="text-neon-secondary" />
        <span className="text-neon-secondary">TRANSMIT</span>
      </button>

      {/* Microphone button for Gemini */}
      {currentProvider === 'gemini' && (
        <button
          onClick={isUserAudioStreaming ? onStopUserAudioStream : onStartUserAudioStream}
          className={`terminal-button flex items-center gap-2 px-4 py-3 relative ${
            isUserAudioStreaming
              ? "border-red-500 text-red-400"
              : "border-neon-primary text-neon-primary"
          }`}
          title={isUserAudioStreaming ? "Stop Recording" : "Start Recording (Push-to-Talk)"}
          style={isUserAudioStreaming ? {
            boxShadow: '0 0 20px rgba(239, 68, 68, 0.6), 0 0 40px rgba(239, 68, 68, 0.3)',
            animation: 'borderPulse 1s infinite ease-in-out'
          } : {}}
        >
          {isUserAudioStreaming ? (
            <>
              <MicOff size={16} className="animate-pulse" />
              <span className="animate-pulse font-bold">RECORDING</span>
              {/* Recording indicator */}
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
            </>
          ) : (
            <>
              <Mic size={16} />
              <span>MIC</span>
            </>
          )}
        </button>
      )}
      
      <button 
        onClick={stopSession} 
        className="terminal-button border-neon-tertiary flex items-center gap-2 px-4 py-3"
      >
        <Code size={16} className="text-neon-tertiary" />
        <span className="text-neon-tertiary">EXIT</span>
      </button>
    </div>
  );
}

export default function SessionControls({
  startSession,
  stopSession,
  sendClientEvent,
  sendTextMessage,
  serverEvents, // This prop seems unused in SessionActive, consider removing if not needed
  isSessionActive,
  currentProvider,
  isUserAudioStreaming,
  onStartUserAudioStream,
  onStopUserAudioStream
}) {
  return (
    <div className="flex gap-4 h-full w-full">
      {isSessionActive ? (
        <SessionActive
          stopSession={stopSession}
          sendClientEvent={sendClientEvent} 
          sendTextMessage={sendTextMessage} 
          serverEvents={serverEvents}
          currentProvider={currentProvider}
          isUserAudioStreaming={isUserAudioStreaming}
          onStartUserAudioStream={onStartUserAudioStream}
          onStopUserAudioStream={onStopUserAudioStream}
        />
      ) : (
        <SessionStopped startSession={startSession} />
      )}
    </div>
  );
}
