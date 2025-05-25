import { useState, useEffect } from "react";
import { Zap, Power, Send, Cpu, Code } from "react-feather";

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
          className="terminal-button flex items-center gap-2 px-6 py-3 text-lg"
        >
          <Power className="text-neon-primary" size={18} />
          <span className="neon-text">INITIALIZE CONNECTION</span>
        </button>
      )}
    </div>
  );
}

function SessionActive({ stopSession, sendTextMessage, currentProvider }) { // Added currentProvider
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
  serverEvents,
  isSessionActive,
  currentProvider, // Added currentProvider
}) {
  return (
    <div className="flex gap-4 h-full w-full">
      {isSessionActive ? (
        <SessionActive
          stopSession={stopSession}
          sendClientEvent={sendClientEvent} // This is App.jsx's sendClientEvent, already OpenAI specific
          sendTextMessage={sendTextMessage} // This is the generic one from App.jsx
          serverEvents={serverEvents}
          currentProvider={currentProvider} // Pass down
        />
      ) : (
        <SessionStopped startSession={startSession} />
      )}
    </div>
  );
}
