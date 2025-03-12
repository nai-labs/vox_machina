import { useState, useEffect } from 'react';
import voxMachinaLogo from '../assets/vox-machina-logo.png';

const loadingMessages = [
  "Initializing neuroacoustic core...",
  "Calibrating voice synthesis matrix...",
  "Synchronizing affective speech patterns...",
  "Establishing neural resonance...",
  "VOX MACHINA systems online"
];

export default function SplashScreen({ onComplete }) {
  const [progress, setProgress] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  
  useEffect(() => {
    // Total duration: 4000ms (4 seconds)
    const totalDuration = 4000;
    const messageCount = loadingMessages.length;
    const intervalPerMessage = totalDuration / messageCount;
    
    // Update progress continuously
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        const newProgress = prev + (100 / (totalDuration / 50)); // Update every 50ms
        return newProgress > 100 ? 100 : newProgress;
      });
    }, 50);
    
    // Update messages at intervals
    const messageInterval = setInterval(() => {
      setMessageIndex(prev => {
        const nextIndex = prev + 1;
        return nextIndex < messageCount ? nextIndex : prev;
      });
    }, intervalPerMessage);
    
    // Complete after total duration
    const timer = setTimeout(() => {
      clearInterval(progressInterval);
      clearInterval(messageInterval);
      onComplete();
    }, totalDuration);
    
    return () => {
      clearInterval(progressInterval);
      clearInterval(messageInterval);
      clearTimeout(timer);
    };
  }, [onComplete]);
  
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-cyber-dark z-50 overflow-hidden">
      {/* Background glow effect */}
      <div className="absolute inset-0 bg-gradient-radial from-cyber-dark via-cyber-dark to-black opacity-80"></div>
      
      <div className="w-full max-w-md flex flex-col items-center relative z-10">
        {/* Logo with enhanced styling */}
        <div className="mb-8 relative">
          <div className="absolute inset-0 bg-gradient-radial from-neon-primary/10 via-transparent to-transparent rounded-full filter blur-xl"></div>
          <img 
            src={voxMachinaLogo} 
            alt="Vox Machina" 
            className="w-64 h-auto relative z-10 mix-blend-screen animate-pulse-subtle"
            style={{ 
              filter: 'drop-shadow(0 0 8px rgba(10, 255, 255, 0.5))',
              animation: 'pulse 4s infinite ease-in-out'
            }}
          />
        </div>
        
        {/* Loading message with typing effect */}
        <div className="text-neon-primary text-sm mb-4 h-6 font-mono relative overflow-hidden">
          <div className="animate-typing">
            {loadingMessages[messageIndex]}
          </div>
        </div>
        
        {/* Enhanced loading bar */}
        <div className="w-full bg-cyber-light/10 h-1.5 rounded-full overflow-hidden backdrop-blur-sm border border-neon-primary/20">
          <div 
            className="h-full bg-gradient-to-r from-neon-secondary/80 to-neon-primary rounded-full transition-all duration-50 ease-linear"
            style={{ 
              width: `${progress}%`,
              boxShadow: '0 0 10px rgba(10, 255, 255, 0.7)'
            }}
          />
        </div>
        
        {/* Audio visualization effect inspired by the logo */}
        <div className="mt-8 flex items-end justify-center space-x-1 h-12 overflow-hidden">
          {Array.from({ length: 20 }).map((_, i) => {
            // Calculate height based on progress and position
            const heightMultiplier = Math.sin((i / 20) * Math.PI + (progress / 100) * Math.PI * 4);
            const height = Math.abs(heightMultiplier) * 100;
            
            return (
              <div
                key={i}
                className="w-1 rounded-t transition-all duration-150"
                style={{ 
                  height: `${height}%`,
                  opacity: 0.3 + (height / 200),
                  background: `linear-gradient(to top, rgba(10, 255, 255, 0.8), rgba(10, 255, 255, 0.2))`,
                  boxShadow: '0 0 5px rgba(10, 255, 255, 0.5)'
                }}
              />
            );
          })}
        </div>
      </div>
      
      {/* Fast flickering particles in the background - matches main UI */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
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
    </div>
  );
}
