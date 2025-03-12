// Utility functions for managing character data

// Get all available characters
export function getAllCharacters() {
  // Convert the characters object to an array for easier use in React components
  return Object.values([
    {
      id: "lily",
      name: "Lily",
      description: "A passionate 24-year-old woman experiencing intense physical pleasure",
      promptName: "Passionate Friend",
      voice: "sage"
    },
    {
      id: "nikki",
      name: "Nikki",
      description: "A drunk 28-year-old woman making an emotional late-night call",
      promptName: "Drunk Woman Late Night Call",
      voice: "sage"
    },
    {
      id: "tina",
      name: "Tina",
      description: "A tipsy woman making a suggestive late-night booty call",
      promptName: "Late Night Booty Call",
      voice: "sage"
    }
  ]);
}

// Get character by ID
export function getCharacterById(id) {
  const characters = getAllCharacters();
  return characters.find(char => char.id === id) || characters[0];
}
