import fs from 'fs';
import path from 'path';

// Function to read character data from characters.json
export function getCharacterPrompts() {
  try {
    const charactersFilePath = path.join(process.cwd(), 'characters.json');
    console.log(`Reading character data from: ${charactersFilePath}`);
    
    const charactersContent = fs.readFileSync(charactersFilePath, 'utf-8');
    const characters = JSON.parse(charactersContent);
    
    console.log(`Loaded ${Object.keys(characters).length} characters: ${Object.keys(characters).join(', ')}`);
    
    return characters;
  } catch (error) {
    console.error('Error reading character data:', error);
    return {};
  }
}

// Get a specific character by ID
export function getCharacterPromptById(id) {
  console.log(`Looking for character with ID: "${id}"`);
  const characters = getCharacterPrompts();
  
  // If the requested character exists, return it
  if (characters[id]) {
    console.log(`Found character: ${characters[id].name}`);
    return characters[id];
  }
  
  // If the requested character doesn't exist, find the first available character as fallback
  const characterIds = Object.keys(characters);
  if (characterIds.length > 0) {
    const fallbackId = characterIds[0];
    console.log(`Character "${id}" not found, using fallback character: ${characters[fallbackId].name}`);
    return characters[fallbackId];
  }
  
  // If no characters are available, return null
  console.error(`No characters available in characters.json`);
  return null;
}
