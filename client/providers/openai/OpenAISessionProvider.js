import { useRef, useState, useCallback } from 'react';

export function useOpenAISession() { // Renamed from useWebRTCSession
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [dataChannel, setDataChannel] = useState(null);
  const [apiModelName, setApiModelName] = useState(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  
  const peerConnection = useRef(null);
  const audioElement = useRef(null);
  const micTrackRef = useRef(null);
  const isSessionInitializedRef = useRef(false);

  const toggleMicMute = useCallback(() => {
    if (micTrackRef.current) {
      const newMuteState = !isMicMuted;
      micTrackRef.current.enabled = !newMuteState;
      setIsMicMuted(newMuteState);
      console.log(`Microphone ${newMuteState ? 'muted' : 'unmuted'}`);
    }
  }, [isMicMuted]);

  const startSession = useCallback(async (selectedCharacter, onTrackReceived) => {
    if (!selectedCharacter) {
      console.error("No character selected");
      return;
    }
    
    console.log("Starting OpenAI session with character:", selectedCharacter); // Log context
    console.log("Temperature:", selectedCharacter.temperature);
    console.log("Voice:", selectedCharacter.voice);
    
    // Get an ephemeral key from the server with the selected character and parameters
    const tokenUrl = `/token?character=${selectedCharacter.id}&temperature=${selectedCharacter.temperature}${selectedCharacter.voice ? `&voice=${selectedCharacter.voice}` : ''}`;
    console.log("Token URL for OpenAI:", tokenUrl); // Log context
    
    const tokenResponse = await fetch(tokenUrl);
    const data = await tokenResponse.json();
    const EPHEMERAL_KEY = data.client_secret.value;

    // Set the API model name from the token response
    if (data.apiModel) {
      setApiModelName(data.apiModel);
      console.log("Using OpenAI API Model from server:", data.apiModel); // Log context
    } else {
      const DEFAULT_CLIENT_MODEL = "gpt-4o-realtime-preview-2024-12-17"; // OpenAI specific
      setApiModelName(DEFAULT_CLIENT_MODEL);
      console.warn(`OpenAI API Model not received from server. Using client-side default: ${DEFAULT_CLIENT_MODEL}`);
    }

    // Create a peer connection
    const pc = new RTCPeerConnection();

    // Set up to play remote audio from the model
    audioElement.current = document.createElement("audio");
    audioElement.current.autoplay = true;
    
    pc.ontrack = (e) => {
      console.log("Received track from OpenAI model"); // Log context
      const stream = e.streams[0];
      audioElement.current.srcObject = stream;
      
      // Call the callback to set up media recording
      if (onTrackReceived) {
        onTrackReceived(stream);
      }
    };

    // Add local audio track for microphone input in the browser
    const ms = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    const micTrack = ms.getTracks()[0];
    micTrackRef.current = micTrack;
    pc.addTrack(micTrack);

    // Set up data channel for sending and receiving events
    const dc = pc.createDataChannel("oai-events"); // OpenAI specific channel name
    setDataChannel(dc);

    // Reset session state
    isSessionInitializedRef.current = false;
    
    // Start the session using the Session Description Protocol (SDP)
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const baseUrl = "https://api.openai.com/v1/realtime"; // OpenAI specific URL
    const modelToUse = data.apiModel || apiModelName || "gpt-4o-realtime-preview-2024-12-17"; // OpenAI specific
    if (!data.apiModel) {
      console.warn(`Using fallback model for OpenAI SDP negotiation: ${modelToUse}`); // Log context
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
  }, [apiModelName]); // apiModelName dependency is fine

  const stopSession = useCallback((onSessionStopped) => {
    console.log("Stopping OpenAI session"); // Log context
    if (dataChannel) {
      dataChannel.close();
    }

    // Stop any active recording
    if (onSessionStopped) {
      onSessionStopped();
    }

    if (peerConnection.current) {
      peerConnection.current.getSenders().forEach((sender) => {
        if (sender.track) {
          sender.track.stop();
        }
      });
      peerConnection.current.close();
    }

    setIsSessionActive(false);
    setDataChannel(null);
    peerConnection.current = null;
  }, [dataChannel]);

  const sendClientEvent = useCallback((message, setEvents) => {
    if (dataChannel) {
      message.event_id = message.event_id || crypto.randomUUID();
      dataChannel.send(JSON.stringify(message));
      // setEvents is App.jsx's state setter, should be handled by the calling component
      // For a provider, it might be better to have an onEventSent callback or similar
      // Or, the provider simply sends, and App.jsx updates its own state if needed.
      // For now, keeping setEvents as it's used by App.jsx to show sent messages.
      if (setEvents) {
         setEvents((prev) => [message, ...prev]);
      }
    } else {
      console.error("Failed to send message to OpenAI - no data channel available", message); // Log context
    }
  }, [dataChannel]);

  const sendTextMessage = useCallback((message, setEvents) => {
    const event = { // OpenAI specific event structure
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

    sendClientEvent(event, setEvents);
    sendClientEvent({ type: "response.create" }, setEvents); // OpenAI specific
  }, [sendClientEvent]);

  return {
    isSessionActive,
    setIsSessionActive,
    dataChannel,
    apiModelName,
    isMicMuted,
    audioElement,
    isSessionInitializedRef,
    toggleMicMute,
    startSession,
    stopSession,
    sendClientEvent,
    sendTextMessage,
    providerType: 'openai' // Add a type identifier
  };
}
