import { useEffect, useRef, useState } from "react";

export default function WaveformVisualizer({ audioStream, isAISpeaking }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const analyserRef = useRef(null);
  const audioContextRef = useRef(null);
  const rotationRef = useRef(0);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  // Set up the audio analyzer when the component mounts or when the audio stream changes
  useEffect(() => {
    if (!audioStream) return;

    // Create audio context and analyzer if they don't exist
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (!analyserRef.current) {
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 512; // Increased for more detailed visualization
      analyserRef.current.smoothingTimeConstant = 0.85;
    }

    // Connect the audio stream to the analyzer
    const source = audioContextRef.current.createMediaStreamSource(audioStream);
    source.connect(analyserRef.current);

    // Clean up function
    return () => {
      if (source) {
        source.disconnect();
      }
      cancelAnimationFrame(animationRef.current);
    };
  }, [audioStream]);

  // Handle canvas resizing
  useEffect(() => {
    const updateCanvasSize = () => {
      if (canvasRef.current) {
        const container = canvasRef.current.parentElement;
        const { width, height } = container.getBoundingClientRect();
        setCanvasSize({ width, height });
        canvasRef.current.width = width;
        canvasRef.current.height = height;
      }
    };

    // Initial size
    updateCanvasSize();

    // Add resize listener
    window.addEventListener('resize', updateCanvasSize);
    
    return () => {
      window.removeEventListener('resize', updateCanvasSize);
    };
  }, []);

  // Draw the radial visualization
  useEffect(() => {
    if (!analyserRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    // Calculate center of the canvas
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    // Calculate the radius based on the smaller dimension
    const maxRadius = Math.min(centerX, centerY) * 0.85;

    const draw = () => {
      // Clear the canvas with a fade effect
      ctx.fillStyle = 'rgba(10, 14, 23, 0.2)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw grid background for cyberpunk effect
      drawCyberpunkGrid(ctx, canvas.width, canvas.height);
      
      // Get the frequency data
      analyserRef.current.getByteFrequencyData(dataArray);
      
      // Slowly rotate the visualization
      rotationRef.current += isAISpeaking ? 0.005 : 0.001;
      
      // Draw the circular visualization
      drawRadialVisualization(ctx, dataArray, centerX, centerY, maxRadius, isAISpeaking);
      
      // Add scan line effect
      drawScanLines(ctx, canvas.width, canvas.height);
      
      // Add subtle logo watermark
      drawWatermark(ctx, canvas.width, canvas.height);
      
      // Continue the animation
      animationRef.current = requestAnimationFrame(draw);
    };
    
    // Function to draw cyberpunk grid background
    function drawCyberpunkGrid(ctx, width, height) {
      const gridSize = 40;
      const gridOpacity = 0.1;
      
      ctx.strokeStyle = `rgba(10, 255, 255, ${gridOpacity})`;
      ctx.lineWidth = 0.5;
      
      // Draw horizontal lines
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      
      // Draw vertical lines
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    }
    
    // Function to draw scan lines
    function drawScanLines(ctx, width, height) {
      // Horizontal scan line
      const scanLineY = (Date.now() % 5000) / 5000 * height;
      ctx.fillStyle = 'rgba(10, 255, 255, 0.15)';
      ctx.fillRect(0, scanLineY, width, 2);
      
      // Circular scan line
      const scanRadius = (Date.now() % 3000) / 3000 * Math.min(centerX, centerY);
      ctx.strokeStyle = 'rgba(0, 170, 255, 0.2)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, scanRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    // Function to draw a subtle watermark
    function drawWatermark(ctx, width, height) {
      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.font = '12px "Share Tech Mono"';
      ctx.fillStyle = 'rgba(10, 255, 255, 1)';
      ctx.textAlign = 'center';
      ctx.fillText('VOX MACHINA', width / 2, height - 20);
      ctx.restore();
    }
    
    // Function to draw the radial visualization
    function drawRadialVisualization(ctx, dataArray, centerX, centerY, maxRadius, isActive) {
      const numBars = dataArray.length / 2; // Use half the data for a cleaner visualization
      const angleStep = (Math.PI * 2) / numBars;
      
      // Base radius when not speaking
      const baseRadius = maxRadius * 0.3;
      
      // Draw outer circle
      ctx.strokeStyle = 'rgba(10, 255, 255, 0.2)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, maxRadius, 0, Math.PI * 2);
      ctx.stroke();
      
      // Draw inner circle
      ctx.strokeStyle = 'rgba(0, 170, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
      ctx.stroke();
      
      // Add glow effect
      ctx.shadowBlur = isActive ? 15 : 5;
      ctx.shadowColor = 'rgba(10, 255, 255, 0.7)';
      
      // Draw the bars
      for (let i = 0; i < numBars; i++) {
        const amplitude = dataArray[i] / 255;
        
        // Calculate dynamic radius based on audio data
        let barHeight;
        if (isActive) {
          barHeight = baseRadius + (amplitude * (maxRadius - baseRadius));
        } else {
          // When not speaking, create a subtle pulsing effect
          const pulse = Math.sin(Date.now() / 1000) * 0.1 + 0.9;
          barHeight = baseRadius + (maxRadius - baseRadius) * 0.1 * pulse;
        }
        
        // Calculate angle with rotation
        const angle = i * angleStep + rotationRef.current;
        
        // Calculate start and end points
        const startX = centerX + Math.cos(angle) * baseRadius;
        const startY = centerY + Math.sin(angle) * baseRadius;
        const endX = centerX + Math.cos(angle) * barHeight;
        const endY = centerY + Math.sin(angle) * barHeight;
        
        // Create gradient for the lines
        const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
        
        if (isActive) {
          // Active colors - more vibrant
          gradient.addColorStop(0, 'rgba(0, 170, 255, 0.7)');
          gradient.addColorStop(1, 'rgba(10, 255, 255, 0.9)');
        } else {
          // Idle colors - more subdued
          gradient.addColorStop(0, 'rgba(0, 170, 255, 0.3)');
          gradient.addColorStop(1, 'rgba(10, 255, 255, 0.4)');
        }
        
        // Draw the line
        ctx.strokeStyle = gradient;
        ctx.lineWidth = isActive ? 2 + amplitude * 2 : 1;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        
        // Add dots at the end of lines for active state
        if (isActive && amplitude > 0.5) {
          ctx.fillStyle = 'rgba(10, 255, 255, 0.9)';
          ctx.beginPath();
          ctx.arc(endX, endY, 2 + amplitude * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      
      // Draw center circle
      const centerGradient = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, baseRadius
      );
      
      if (isActive) {
        centerGradient.addColorStop(0, 'rgba(10, 255, 255, 0.7)');
        centerGradient.addColorStop(1, 'rgba(0, 170, 255, 0.1)');
      } else {
        centerGradient.addColorStop(0, 'rgba(10, 255, 255, 0.3)');
        centerGradient.addColorStop(1, 'rgba(0, 170, 255, 0.05)');
      }
      
      ctx.fillStyle = centerGradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Start the animation
    draw();

    // Clean up
    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [isAISpeaking, canvasSize]);

  return (
    <div className="waveform-container w-full h-full relative">
      <canvas 
        ref={canvasRef} 
        className="w-full h-full rounded"
      />
      {!isAISpeaking && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-neon-primary text-sm opacity-50 flex flex-col items-center">
            <span>VOX MACHINA ACTIVE</span>
            <span className="text-xs mt-1">AWAITING TRANSMISSION</span>
          </div>
        </div>
      )}
    </div>
  );
}
