// Utility functions for managing character data
import charactersJson from '../../characters.json';

// Load characters from characters.json
function loadCharactersFromJson() {
  try {
    // Convert the characters object to an array for easier use in React components
    return Object.values(charactersJson).map(char => ({
      id: char.id,
      name: char.name,
      description: char.description,
      promptName: char.promptName,
      voice: char.voice,
      prompt: char.prompt, // Added prompt field
      iconType: char.iconType || 'user', // Default to 'user' if iconType is not specified
      avatarPath: char.avatarPath // Include the avatar path if available
    }));
  } catch (error) {
    console.error('Error loading characters from JSON:', error);
    
    // Fallback to default characters if JSON loading fails
    return [
      {
        id: "default_character",
        name: "Default Character",
        description: "A fallback character when JSON loading fails",
        promptName: "Default",
        voice: "sage",
        iconType: "user"
      }
    ];
  }
}

// Cache the characters to avoid reloading the JSON file on every call
let charactersCache = null;

// Get all available characters
export function getAllCharacters() {
  if (!charactersCache) {
    charactersCache = loadCharactersFromJson();
  }
  return charactersCache;
}

// Get character by ID
export function getCharacterById(id) {
  const characters = getAllCharacters();
  return characters.find(char => char.id === id) || characters[0];
}

// Clear the cache (useful if characters.json is updated at runtime)
export function clearCharacterCache() {
  charactersCache = null;
}
