import { CornerUpRight, CornerDownRight, ChevronDown, ChevronUp, Terminal, Server } from "react-feather";
import { useState } from "react";

function Event({ event, timestamp }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isClient = event.event_id && !event.event_id.startsWith("event_");
  
  // Get a simple content display from the event
  const getDisplayContent = () => {
    if (event.type === "conversation.item.create" && event.item?.content) {
      return event.item.content.map(c => c.text).join(" ");
    }
    
    if (event.type === "text_response.delta" && event.delta?.content) {
      return event.delta.content.map(c => c.text).join(" ");
    }
    
    return null;
  };
  
  const displayContent = getDisplayContent();

  return (
    <div className={`flex flex-col gap-1 p-2 rounded border-l-4 mb-3 
                   ${isClient 
                     ? "border-l-neon-primary bg-cyber-dark/70" 
                     : "border-l-neon-secondary bg-cyber-dark/70"}`}>
      <div
        className="flex items-center gap-2 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center">
          {isClient ? (
            <CornerUpRight size={14} className="text-neon-primary mr-2" />
          ) : (
            <CornerDownRight size={14} className="text-neon-secondary mr-2" />
          )}
          
          {isClient ? (
            <Terminal size={12} className="text-neon-primary mr-1" />
          ) : (
            <Server size={12} className="text-neon-secondary mr-1" />
          )}
        </div>
        
        <div className={`text-xs font-mono ${isClient ? "text-neon-primary" : "text-neon-secondary"}`}>
          {isClient ? "USER" : "SYSTEM"} :: {event.type}
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

  events.forEach((event) => {
    if (event.type.endsWith("delta")) {
      if (deltaEvents[event.type]) {
        // for now just log a single event per render pass
        return;
      } else {
        deltaEvents[event.type] = event;
      }
    }

    eventsToDisplay.push(
      <Event
        key={event.event_id || `${event.type}-${Math.random()}`}
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
