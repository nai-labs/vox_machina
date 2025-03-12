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
  
  const character = characters[id] || characters['lily'] || null;
  if (character) {
    console.log(`Found character: ${character.name}`);
  } else {
    console.error(`Character with ID "${id}" not found`);
  }
  
  return character;
}
