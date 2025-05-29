import { CornerUpRight, CornerDownRight, ChevronDown, ChevronUp, Terminal, Server } from "react-feather";
import { useState } from "react";

function Event({ event, timestamp }) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Determine if the event is from the client (user) or system/model
  // OpenAI user events often have event.item.role === 'user' or are of type "conversation.item.create"
  // Gemini user events (local echo) have event.role === 'user'
  const isClientEvent = (event.item?.role === 'user' || event.role === 'user' || (event.event_id && !event.event_id.startsWith("event_")));
  const isSystemStatus = event.type === 'status' || event.status; // For Gemini status messages
  const isErrorEvent = event.type === 'error' || event.error;
  const isTranscriptionEvent = event.type === 'gemini_transcription';

  // Get a simple content display from the event
  const getDisplayContent = () => {
    if (event.type === "conversation.item.create" && event.item?.content) { // OpenAI user message
      return event.item.content.map(c => c.text).join(" ");
    }
    if (event.type === "text_message" && event.role === 'user' && event.content) { // Gemini local echo user message
        return event.content;
    }
    if (event.type === "text_response.delta" && event.delta?.content) { // OpenAI delta
      return event.delta.content.map(c => c.text).join(" ");
    }
    if (isSystemStatus) {
      return event.content || event.status || event.reason || "Status message";
    }
    if (isErrorEvent) {
        return event.content || event.error || event.reason || "Error message";
    }
    if (isTranscriptionEvent && event.text) {
        return `Transcription: ${event.text}`;
    }
    if (event.type === 'gemini_text_chunk' && event.text) { // Gemini text chunk from server
        return event.text;
    }
    // Fallback for other OpenAI system messages that might have text
    if (event.text) return event.text; 
    if (event.message?.content?.parts?.[0]?.text) return event.message.content.parts[0].text;


    return null; // No simple display content
  };
  
  const displayContent = getDisplayContent();
  const eventTypeDisplay = event.type || (isSystemStatus ? 'STATUS' : isErrorEvent ? 'ERROR' : 'UNKNOWN_EVENT');

  // Styling based on event source
  let borderColorClass = "border-l-neon-secondary"; // Default to system/model
  let textColorClass = "text-neon-secondary";
  let sourcePrefix = "SYSTEM";
  let SourceIcon = Server;

  if (isClientEvent) {
    borderColorClass = "border-l-neon-primary";
    textColorClass = "text-neon-primary";
    sourcePrefix = "USER";
    SourceIcon = Terminal;
  } else if (isErrorEvent) {
    borderColorClass = "border-l-red-500";
    textColorClass = "text-red-400";
    sourcePrefix = "ERROR";
  } else if (isSystemStatus) {
    borderColorClass = "border-l-yellow-500";
    textColorClass = "text-yellow-400";
    sourcePrefix = "STATUS";
  } else if (isTranscriptionEvent) {
    borderColorClass = "border-l-cyan-500";
    textColorClass = "text-cyan-400";
    sourcePrefix = "TRANSCRIPT";
  }


  return (
    <div className={`flex flex-col gap-1 p-2 rounded border-l-4 mb-3 bg-cyber-dark/70 ${borderColorClass}`}>
      <div
        className="flex items-center gap-2 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center">
          {isClientEvent ? (
            <CornerUpRight size={14} className="text-neon-primary mr-2" />
          ) : (
            <CornerDownRight size={14} className="text-neon-secondary mr-2" />
          )}
          
          <SourceIcon size={12} className={`${textColorClass} mr-1`} />
        </div>
        
        <div className={`text-xs font-mono ${textColorClass}`}>
          {sourcePrefix} :: {eventTypeDisplay}
        </div>
        
        <div className="text-xs opacity-60 ml-auto">{timestamp}</div>
        
        {isExpanded ? (
          <ChevronUp size={14} className="opacity-70" />
        ) : (
          <ChevronDown size={14} className="opacity-70" />
        )}
      </div>
      
      {/* Simple content display when available and not expanded */}
      {displayContent && !isExpanded && (
        <div className="text-sm ml-6 mt-1 opacity-80 line-clamp-1">{displayContent}</div>
      )}
      
      <div
        className={`bg-cyber-medium border border-cyber-light p-2 rounded overflow-x-auto mt-1 ${
          isExpanded ? "block" : "hidden"
        }`}
      >
        <div className="flex items-center justify-between mb-1 text-xs opacity-60">
          <span>EVENT DATA</span>
          <span>{event.event_id || "system-event"}</span>
        </div>
        <pre className="text-xs text-cyber-text font-mono">{JSON.stringify(event, null, 2)}</pre>
      </div>
    </div>
  );
}

export default function EventLog({ events }) {
  const eventsToDisplay = [];
  let deltaEvents = {};
  
  // Create a stable unique key for each event
  const createEventKey = (event, index) => {
    // Use event_id if available
    if (event.event_id) {
      return event.event_id;
    }
    
    // For events without event_id, create a stable key using multiple properties
    const keyParts = [
      event.type,
      event.timestamp || Date.now(),
      index, // Use index as last resort to ensure uniqueness
    ];
    
    // Add additional identifying properties if available
    if (event.item?.id) keyParts.push(event.item.id);
    if (event.response?.id) keyParts.push(event.response.id);
    if (event.conversation?.id) keyParts.push(event.conversation.id);
    
    return keyParts.join('-');
  };

  events.forEach((event, index) => {
    // Check if event and event.type are valid before calling .endsWith()
    if (event && typeof event.type === 'string' && event.type.endsWith("delta")) {
      if (deltaEvents[event.type]) {
        // for now just log a single event per render pass
        return;
      } else {
        deltaEvents[event.type] = event;
      }
    }

    eventsToDisplay.push(
      <Event
        key={createEventKey(event, index)}
        event={event}
        timestamp={new Date().toLocaleTimeString()}
      />,
    );
  });

  return (
    <div className="flex flex-col">
      {events.length === 0 ? (
        <div className="text-center py-6 opacity-60 flex flex-col items-center">
          <div className="mb-2 animate-pulse">
            <Terminal size={20} className="text-neon-primary" />
          </div>
          <div className="text-sm text-neon-primary">AWAITING DATA STREAM</div>
          <div className="text-xs mt-2">CONNECTION IDLE</div>
        </div>
      ) : (
        eventsToDisplay
      )}
    </div>
  );
}
