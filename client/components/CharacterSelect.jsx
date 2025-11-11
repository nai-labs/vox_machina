import { useState, useEffect } from "react"; // Added useEffect
import { getAllCharacters } from "../utils/characterData";
import { PhoneCall, Zap, Thermometer, Volume2 } from "react-feather"; 
// import Brain from "react-feather/dist/icons/brain"; // Temporarily removed Brain
// User, Heart, MessageCircle, Mic, Book, Terminal are not used in the current snippet,
// but if they were, they'd be imported similarly.

export default function CharacterSelect({ onSelectCharacter, currentProvider }) { // Added currentProvider prop
  const [selectedCharacterId, setSelectedCharacterId] = useState("bill");
  const [temperature, setTemperature] = useState(0.8); // Initial default, will be adjusted by useEffect
  const [selectedVoice, setSelectedVoice] = useState(null);
  const characters = getAllCharacters();

  // Define temperature configurations per provider
  const tempConfigs = {
    openai: { min: 0.1, max: 1.2, step: 0.05, default: 0.8 },
    gemini: { min: 0.0, max: 2.0, step: 0.05, default: 1.0 } 
  };

  const currentTempConfig = tempConfigs[currentProvider] || tempConfigs.openai;

  // Effect to adjust temperature if currentProvider changes, ensuring it's within new bounds.
  useEffect(() => {
    // This effect runs when currentProvider (and thus currentTempConfig) changes.
    // It clamps the *current* temperature to the new provider's valid range.
    setTemperature(prevTemp => Math.min(Math.max(prevTemp, currentTempConfig.min), currentTempConfig.max));
  }, [currentProvider]); // Only re-run if currentProvider changes

  const handleSelect = (characterId) => {
    setSelectedCharacterId(characterId);
    setSelectedVoice(null); // Reset voice to character default

    // Set temperature based on the newly selected character and current provider
    const charData = characters.find(c => c.id === characterId);
    const providerConfig = tempConfigs[currentProvider] || tempConfigs.openai;
    let targetTemp = providerConfig.default;

    if (charData && charData.temperature !== undefined) {
      targetTemp = charData.temperature;
    }
    
    setTemperature(Math.min(Math.max(targetTemp, providerConfig.min), providerConfig.max));
  };

  // Initialize temperature on first load for the default selected character & provider
  useEffect(() => {
    const initialCharData = characters.find(c => c.id === selectedCharacterId);
    const initialProviderConfig = tempConfigs[currentProvider] || tempConfigs.openai;
    let initialTargetTemp = initialProviderConfig.default;

    if (initialCharData && initialCharData.temperature !== undefined) {
      initialTargetTemp = initialCharData.temperature;
    }
    setTemperature(Math.min(Math.max(initialTargetTemp, initialProviderConfig.min), initialProviderConfig.max));
  // eslint-disable-next-line react-hooks/exhaustive-deps 
  }, []); // Run only once on mount to set initial temperature for default character/provider

  const handleConfirm = () => {
    const selectedCharacterData = characters.find(char => char.id === selectedCharacterId);
    let voiceToUse = selectedVoice;

    if (!selectedVoice) { // "Default" was selected in dropdown
      if (currentProvider === 'gemini') {
        // For Gemini, if default is chosen, use character's geminiVoice if defined, else a hardcoded Gemini default.
        // Since we decided not to add geminiVoice to characters.json, we'll use a general default.
        voiceToUse = 'Aoede'; // General default Gemini voice
      } else { // OpenAI
        voiceToUse = selectedCharacterData.voice || 'sage'; // Character's OpenAI default or general OpenAI default
      }
    }

    onSelectCharacter({
      ...selectedCharacterData,
      temperature,
      voice: voiceToUse // This will be a provider-appropriate voice
    });
  };

  // Get temperature color based on value
  const getTemperatureColor = (temp) => {
    if (temp < 0.4) return "text-blue-400";
    if (temp < 0.7) return "text-cyan-400";
    if (temp < 1.0) return "text-yellow-400";
    return "text-red-400";
  };

  return (
    <div className="flex flex-col items-center justify-center w-full h-full p-3 overflow-y-auto">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mb-4 w-full max-w-6xl">
        {characters.map((character) => (
          <div 
            key={character.id}
            className={`terminal-panel cursor-pointer p-1 flex flex-col transition-all duration-300 ${
              selectedCharacterId === character.id 
                ? "border-neon-primary shadow-neon-glow" 
                : "border-cyber-light hover:border-neon-secondary"
            }`}
            onClick={() => handleSelect(character.id)}
          >
            {/* Avatar Image */}
            {character.avatarPath && (
              <div className="mb-1 relative overflow-hidden rounded-sm">
                <div className="terminal-scan-line absolute inset-0 opacity-30"></div>
                <img 
                  src={character.avatarPath} 
                  alt={`${character.name} avatar`}
                  className={`w-full h-12 sm:h-14 md:h-16 object-cover ${
                    selectedCharacterId === character.id 
                      ? "border border-neon-primary animate-pulse-subtle" 
                      : "border border-cyber-light"
                  }`}
                />
              </div>
            )}
            
            <div className="terminal-header flex items-center justify-between">
              <span className="flex items-center gap-1">
                <PhoneCall size={16} className="text-neon-secondary" />
                <span className={`text-xs ${selectedCharacterId === character.id ? "text-neon-primary" : ""}`}>
                  {character.name}
                </span>
              </span>
              <div className={`h-1.5 w-1.5 rounded-full ${selectedCharacterId === character.id ? "bg-neon-primary animate-pulse" : "bg-cyber-light"}`}></div>
            </div>
          </div>
        ))}
      </div>
      
      {/* Neural Voice Parameters Panel */}
      <div className="terminal-panel w-full max-w-6xl mb-4 p-3">
        <div className="terminal-header flex items-center gap-2 mb-3">
          <Zap size={16} className="text-neon-primary" />
          <h3 className="text-sm neon-text">NEURAL VOICE PARAMETERS</h3>
        </div>
        
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Temperature Control */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <label className="flex items-center gap-1 text-xs">
                <Thermometer size={14} className={getTemperatureColor(temperature)} />
                <span>TEMPERATURE ({currentProvider.toUpperCase()})</span>
              </label>
              <span className={`text-xs font-mono ${getTemperatureColor(temperature)}`}>{temperature.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-blue-400">{currentTempConfig.min.toFixed(1)}</span>
              <input
                type="range"
                min={currentTempConfig.min}
                max={currentTempConfig.max}
                step={currentTempConfig.step}
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="flex-1 h-2 bg-cyber-dark rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #3b82f6, #06b6d4, #facc15, #ef4444)`, // Style might need adjustment if range changes drastically
                }}
              />
              <span className="text-xs text-red-400">{currentTempConfig.max.toFixed(1)}</span>
            </div>
            <div className="flex justify-between text-[10px] mt-1 text-cyber-light">
              <span>Focused</span>
              <span>Creative</span>
            </div>
          </div>
          
          {/* Voice Selection */}
          <div className="flex-1">
            <div className="flex items-center gap-1 mb-1">
              <Volume2 size={14} className="text-neon-primary" />
              <label className="text-xs">VOICE PROFILE ({currentProvider.toUpperCase()})</label>
            </div>
            <div className="terminal-select-wrapper">
              <select
                value={selectedVoice || "default"}
                onChange={(e) => setSelectedVoice(e.target.value === "default" ? null : e.target.value)}
                className="terminal-select w-full text-sm p-1.5 bg-cyber-dark border border-neon-primary text-cyber-text"
              >
                <option value="default" className="bg-cyber-dark text-neon-secondary">
                  Default ({characters.find(c => c.id === selectedCharacterId)?.voice || (currentProvider === 'openai' ? "sage" : "Kore")})
                </option>
                {currentProvider === 'openai' && (
                  <>
                    <option value="alloy" className="bg-cyber-dark text-neon-primary">Alloy</option>
                    <option value="ash" className="bg-cyber-dark text-neon-primary">Ash</option>
                    <option value="ballad" className="bg-cyber-dark text-neon-primary">Ballad</option>
                    <option value="coral" className="bg-cyber-dark text-neon-tertiary">Coral</option>
                    <option value="echo" className="bg-cyber-dark text-neon-primary">Echo</option>
                    <option value="marin" className="bg-cyber-dark text-neon-primary">Marin</option>
                    <option value="sage" className="bg-cyber-dark text-neon-secondary">Sage</option>
                    <option value="shimmer" className="bg-cyber-dark text-neon-primary">Shimmer</option>
                    <option value="verse" className="bg-cyber-dark text-neon-primary">Verse</option>
                  </>
                )}
                {currentProvider === 'gemini' && (
                  <>
                    {/* Updated Gemini voices */}
                    <option value="Aoede" className="bg-cyber-dark text-neon-tertiary">Aoede</option>
                    <option value="Kore" className="bg-cyber-dark text-neon-secondary">Kore</option>
                    <option value="Leda" className="bg-cyber-dark text-neon-primary">Leda</option>
                    <option value="Zephyr" className="bg-cyber-dark text-neon-primary">Zephyr</option>
                    <option value="Callirrhoe" className="bg-cyber-dark text-neon-primary">Callirrhoe</option>
                    <option value="Autonoe" className="bg-cyber-dark text-neon-primary">Autonoe</option>
                    <option value="Despina" className="bg-cyber-dark text-neon-primary">Despina</option>
                    <option value="Erinome" className="bg-cyber-dark text-neon-primary">Erinome</option>
                    <option value="Laomedeia" className="bg-cyber-dark text-neon-primary">Laomedeia</option>
                    <option value="Achernar" className="bg-cyber-dark text-neon-primary">Achernar</option>
                    <option value="Gacrux" className="bg-cyber-dark text-neon-primary">Gacrux</option>
                    <option value="Pulcherrima" className="bg-cyber-dark text-neon-primary">Pulcherrima</option>
                    <option value="Vindemiatrix" className="bg-cyber-dark text-neon-primary">Vindemiatrix</option>
                    <option value="Sulafat" className="bg-cyber-dark text-neon-primary">Sulafat</option>
                    {/* Original shorter list for reference, can be removed if new list is complete */}
                    {/* <option value="Puck" className="bg-cyber-dark text-neon-primary">Puck</option> */}
                    {/* <option value="Charon" className="bg-cyber-dark text-neon-primary">Charon</option> */}
                    {/* <option value="Fenrir" className="bg-cyber-dark text-neon-primary">Fenrir</option> */}
                    {/* <option value="Orus" className="bg-cyber-dark text-neon-primary">Orus</option> */}
                  </>
                )}
              </select>
            </div>
          </div>
        </div>
      </div>
      
      <button
        onClick={handleConfirm}
        className="terminal-button flex items-center gap-2 px-5 py-2 text-base"
      >
        {/* <Brain className="text-neon-primary" size={16} /> Temporarily removed Brain icon */}
        <Zap className="text-neon-primary" size={16} /> {/* Using Zap as a placeholder */}
        <span className="neon-text">INITIALIZE ({currentProvider.toUpperCase()})</span>
      </button>
    </div>
  );
}
