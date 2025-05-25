import { useRef, useState, useCallback } from 'react';

export function useWebRTCSession() {
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
    
    console.log("Starting session with character:", selectedCharacter);
    console.log("Temperature:", selectedCharacter.temperature);
    console.log("Voice:", selectedCharacter.voice);
    
    // Get an ephemeral key from the server with the selected character and parameters
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
    const dc = pc.createDataChannel("oai-events");
    setDataChannel(dc);

    // Reset session state
    isSessionInitializedRef.current = false;
    
    // Start the session using the Session Description Protocol (SDP)
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const baseUrl = "https://api.openai.com/v1/realtime";
    const modelToUse = data.apiModel || apiModelName || "gpt-4o-realtime-preview-2024-12-17";
    if (!data.apiModel) {
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
  }, [apiModelName]);

  const stopSession = useCallback((onSessionStopped) => {
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
      setEvents((prev) => [message, ...prev]);
    } else {
      console.error("Failed to send message - no data channel available", message);
    }
  }, [dataChannel]);

  const sendTextMessage = useCallback((message, setEvents) => {
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

    sendClientEvent(event, setEvents);
    sendClientEvent({ type: "response.create" }, setEvents);
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
    sendTextMessage
  };
}
