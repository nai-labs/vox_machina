import { useState } from "react";
import { getAllCharacters } from "../utils/characterData";
import { User, Zap, Heart, MessageCircle, PhoneCall, Volume2, Thermometer } from "react-feather";

export default function CharacterSelect({ onSelectCharacter }) {
  const [selectedCharacterId, setSelectedCharacterId] = useState("lily");
  const [temperature, setTemperature] = useState(0.8);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const characters = getAllCharacters();

  const handleSelect = (characterId) => {
    setSelectedCharacterId(characterId);
    // Reset voice to character default when changing character
    setSelectedVoice(null);
  };

  const handleConfirm = () => {
    const selectedCharacter = characters.find(char => char.id === selectedCharacterId);
    // Add temperature and voice to the character object
    onSelectCharacter({
      ...selectedCharacter,
      temperature,
      voice: selectedVoice || selectedCharacter.voice
    });
  };

  // Get temperature color based on value
  const getTemperatureColor = (temp) => {
    if (temp < 0.4) return "text-blue-400";
    if (temp < 0.7) return "text-cyan-400";
    if (temp < 1.0) return "text-yellow-400";
    return "text-red-400";
  };

  // Get character-specific icon
  const getCharacterIcon = (id) => {
    switch(id) {
      case 'lily':
        return <Heart size={16} className="text-neon-primary" />;
      case 'nikki':
        return <MessageCircle size={16} className="text-neon-tertiary" />;
      case 'tina':
        return <PhoneCall size={16} className="text-neon-secondary" />;
      default:
        return <User size={16} className="text-neon-secondary" />;
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full h-full p-3">
      <div className="terminal-header flex items-center gap-2 mb-4">
        <Zap size={18} className="text-neon-primary" />
        <h2 className="text-lg neon-text">SELECT VOX MACHINA PERSONA</h2>
      </div>
      
      <div className="grid grid-cols-3 gap-3 mb-4 w-full max-w-3xl">
        {characters.map((character) => (
          <div 
            key={character.id}
            className={`terminal-panel cursor-pointer p-2 flex flex-col transition-all duration-300 ${
              selectedCharacterId === character.id 
                ? "border-neon-primary shadow-neon-glow" 
                : "border-cyber-light hover:border-neon-secondary"
            }`}
            onClick={() => handleSelect(character.id)}
          >
            <div className="terminal-header flex items-center justify-between">
              <span className="flex items-center gap-1">
                {getCharacterIcon(character.id)}
                <span className={`text-sm ${selectedCharacterId === character.id ? "text-neon-primary" : ""}`}>
                  {character.name}
                </span>
              </span>
              <div className={`h-1.5 w-1.5 rounded-full ${selectedCharacterId === character.id ? "bg-neon-primary animate-pulse" : "bg-cyber-light"}`}></div>
            </div>
            
            <div className="flex-1">
              <p className="text-xs opacity-80 mt-1 line-clamp-2">{character.description}</p>
            </div>
          </div>
        ))}
      </div>
      
      {/* Neural Voice Parameters Panel */}
      <div className="terminal-panel w-full max-w-3xl mb-4 p-3">
        <div className="terminal-header flex items-center gap-2 mb-3">
          <Zap size={16} className="text-neon-primary" />
          <h3 className="text-sm neon-text">NEURAL VOICE PARAMETERS</h3>
        </div>
        
        {/* Temperature Control */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <label className="flex items-center gap-1 text-xs">
              <Thermometer size={14} className={getTemperatureColor(temperature)} />
              <span>TEMPERATURE</span>
            </label>
            <span className={`text-xs font-mono ${getTemperatureColor(temperature)}`}>{temperature.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-blue-400">0.1</span>
            <input
              type="range"
              min="0.1"
              max="1.2"
              step="0.05"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="flex-1 h-2 bg-cyber-dark rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #3b82f6, #06b6d4, #facc15, #ef4444)`,
              }}
            />
            <span className="text-xs text-red-400">1.2</span>
          </div>
          <div className="flex justify-between text-[10px] mt-1 text-cyber-light">
            <span>Focused</span>
            <span>Creative</span>
          </div>
        </div>
        
        {/* Voice Selection */}
        <div>
          <div className="flex items-center gap-1 mb-1">
            <Volume2 size={14} className="text-neon-primary" />
            <label className="text-xs">VOICE PROFILE</label>
          </div>
          <div className="terminal-select-wrapper">
            <select
              value={selectedVoice || "default"}
              onChange={(e) => setSelectedVoice(e.target.value === "default" ? null : e.target.value)}
              className="terminal-select w-full text-sm p-1.5 bg-cyber-dark border border-neon-primary text-cyber-text"
            >
              <option value="default" className="bg-cyber-dark text-neon-secondary">Default ({characters.find(c => c.id === selectedCharacterId)?.voice || "sage"})</option>
              <option value="shimmer" className="bg-cyber-dark text-neon-primary">Shimmer</option>
              <option value="coral" className="bg-cyber-dark text-neon-tertiary">Coral</option>
              <option value="sage" className="bg-cyber-dark text-neon-secondary">Sage</option>
            </select>
          </div>
        </div>
      </div>
      
      <button
        onClick={handleConfirm}
        className="terminal-button flex items-center gap-2 px-5 py-2 text-base"
      >
        <Zap className="text-neon-primary" size={16} />
        <span className="neon-text">INITIALIZE SELECTED PERSONA</span>
      </button>
    </div>
  );
}
