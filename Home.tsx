/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
// Fix: Use GenerateContentParameters instead of deprecated GenerateContentRequest.
import {GoogleGenAI, GenerateContentParameters} from '@google/genai';
import {LoaderCircle, SendHorizontal, Wand} from 'lucide-react';
import {useEffect, useRef, useState} from 'react';

const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

const SYSTEM_INSTRUCTION = `You are an expert dungeon master for a text-based adventure game with an Agent-based design. The theme is Harry Potter.

**BACKGROUND & MISSION:**
The player is a Hogwarts student (their specific house is not important). They have just received a mysterious note delivered by a faint magical breeze in their dormitory. The note reads:

"When the midnight bell tolls, come to the deepest part of the library. You will find a forgotten spellbook, which holds forbidden secrets. If you are discovered, you will be sent back to your dormitory, but if you can find it... you will unlock magic beyond the classroom."

Driven by this, the player's quest is to sneak out of their dormitory and reach the library's Restricted Section to find this spellbook.

**GAME LOCATIONS & CHALLENGES:**

1.  **Starting Point: The Dormitory**
    *   The game begins with the player in their dark, quiet dormitory, having just read the mysterious note. The clock has just struck midnight. Their first challenge is to get out of the dorm room and common room without waking their housemates or alerting any prefects.

2.  **The Corridors:**
    *   **Patrolling Ghosts:** Benign ghosts like the Fat Friar or Nearly-Headless Nick patrol the halls. They aren't actively looking for students, but loud noises will attract their attention, and they might express disapproval or float off, potentially alerting others.
    *   **Talking Portraits:** The portraits lining the walls are sentient. Some might offer cryptic clues or ignore the player. Others are grumpy and might threaten to shout if the player doesn't appease them (e.g., with a polite word, a clever lie, or a simple spell). If a portrait shouts, the chance of a teacher appearing increases dramatically.
    *   **Patrolling Teachers & Caretakers:** Professor Snape and Argus Filch (with Mrs. Norris) are the primary threats. Their appearance should be random but more likely if the player makes noise. If the player is spotted, the game is over. The player must hide (behind armor, tapestries) or use spells (like a Silencing Charm) to avoid detection.

3.  **Peeves the Poltergeist:**
    *   Peeves can appear anywhere, anytime. He is a chaos agent. He will try to expose the player by making loud noises, dropping things, or yelling. The player must be creative to deal with him: distract him, trick him, or use a spell to momentarily inconvenience him. Ignoring him is very risky.

4.  **Climax: The Library's Restricted Section:**
    *   Once the player reaches the library, they must get into the Restricted Section.
    *   Inside, the atmosphere is eerie. Books whisper, and some may fly off the shelves.
    *   The "Forgotten Spellbook" is locked away. The player must solve a simple puzzle to retrieve it (e.g., finding a hidden switch, saying a specific incantation found on a nearby scroll).

**SUCCESS & FAILURE:**
*   **Success:** The player finds the book and gains new magical knowledge. Describe this victory.
*   **Failure (Game Over):** Getting caught by a teacher or Filch, making too much noise repeatedly, or failing to handle a major threat like Peeves or a shouting portrait.

**PLAYER FREEDOM:**
While the main quest is the goal, the player has freedom. If they decide to go to the kitchens or the Owlery instead of the library, generate a plausible, random scenario for that location. After their detour, you can gently guide them back towards the main quest (e.g., "As you leave the kitchens, you remember your goal to reach the library.").

**YOUR RESPONSE FORMAT:**
Your response MUST BE a valid JSON object. Do not add any text or markdown before or after the JSON block. The JSON object must have this exact structure:
{
  "sceneDescription": "A detailed, vivid description of the current scene and the outcome of the player's action.",
  "location": "A short, specific name for the player's current location (e.g., 'Gryffindor Common Room', 'Third-Floor Corridor', 'Library - Restricted Section').",
  "promptForImage": "A concise, descriptive prompt for an image generation model, summarizing the scene visually. Example: 'A Hogwarts student hiding behind a suit of armor as Professor Snape walks down the dark, torch-lit corridor.'",
  "isGameOver": boolean,
  "gameOverReason": "A string explaining why the game is over. This should be null if isGameOver is false."
}
`;

interface GameTurn {
  text: string;
  image?: string | null;
  isUserInput?: boolean;
}

export default function Home() {
  const [history, setHistory] = useState<GameTurn[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isGameOver, setIsGameOver] = useState(false);
  const [gameOverReason, setGameOverReason] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState('');

  const storyEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    storyEndRef.current?.scrollIntoView({behavior: 'smooth'});
  };

  useEffect(() => {
    scrollToBottom();
  }, [history]);

  const generateImage = async (prompt: string): Promise<string | null> => {
    try {
      const imagePrompt = `A moody, dark, cinematic digital painting of a scene in Hogwarts at night. The scene is: ${prompt}`;
      const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: imagePrompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio: '16:9',
        },
      });

      const base64ImageBytes = response.generatedImages[0].image.imageBytes;
      return `data:image/jpeg;base64,${base64ImageBytes}`;
    } catch (e) {
      console.error('Image generation failed:', e);
      setError('The magic of vision failed. Please try again.');
      return null;
    }
  };

  const getNextStep = async (
    gameHistory: GameTurn[],
    latestUserInput: string,
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      // Fix: Use GenerateContentParameters instead of deprecated GenerateContentRequest.
      const contents: GenerateContentParameters['contents'] = gameHistory
        .map((turn) => ({
          // Fix: Role must be lowercase 'user' or 'model'.
          role: turn.isUserInput ? 'user' : 'model',
          parts: [{text: turn.text}],
        }))
        .concat([
          {
            // Fix: Role must be lowercase 'user'.
            role: 'user',
            parts: [{text: latestUserInput}],
          },
        ]);

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
        },
      });

      const responseJson = JSON.parse(response.text);

      const {
        sceneDescription,
        isGameOver,
        gameOverReason,
        location,
        promptForImage,
      } = responseJson;

      const imageUrl = await generateImage(promptForImage);
      setCurrentLocation(location);

      setHistory((prev) => [
        ...prev,
        {text: sceneDescription, image: imageUrl},
      ]);

      if (isGameOver) {
        setIsGameOver(true);
        setGameOverReason(gameOverReason);
      }
    } catch (e) {
      console.error('Game logic failed:', e);
      setError(
        'The castle whispers are confusing... The connection was lost. Please try again.',
      );
      // Remove the user's input from history if the call fails
      setHistory((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const startGame = async () => {
    setIsLoading(true);
    setError(null);
    setHistory([]);
    setIsGameOver(false);
    setCurrentLocation('');

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents:
          'Start the game by describing the player reading the mysterious note in their dark dormitory as the clock strikes midnight.',
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
        },
      });
      const responseJson = JSON.parse(response.text);
      const {sceneDescription, location, promptForImage} = responseJson;

      const imageUrl = await generateImage(promptForImage);

      setHistory([{text: sceneDescription, image: imageUrl}]);
      setCurrentLocation(location);
    } catch (e) {
      console.error('Failed to start game:', e);
      setError('Could not initialize the magic. Please refresh the page.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    startGame();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim() || isLoading || isGameOver) return;

    const newHistory = [...history, {text: userInput, isUserInput: true}];
    setHistory(newHistory);
    getNextStep(history, userInput);
    setUserInput('');
  };

  const latestImage = history.slice().reverse().find((h) => h.image)?.image;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-serif flex flex-col items-center p-4 sm:p-6 hogwarts-bg">
      <main className="container mx-auto max-w-4xl w-full flex flex-col h-[95vh]">
        <header className="text-center mb-4">
          <h1 className="text-3xl sm:text-4xl font-bold font-mega text-amber-200 tracking-wider">
            Hogwarts: Midnight Wanderer
          </h1>
          {currentLocation && (
            <p className="text-amber-100/70 italic mt-1">
              Location: {currentLocation}
            </p>
          )}
        </header>

        <section
          aria-live="polite"
          className="flex-grow flex flex-col bg-slate-800/50 backdrop-blur-sm border border-slate-600 rounded-lg shadow-lg overflow-hidden">
          <div
            className="w-full h-48 sm:h-80 bg-slate-900 border-b-2 border-amber-300/50 relative"
            role="img"
            aria-label="Current Scene">
            {isLoading && !latestImage && (
              <div className="flex flex-col items-center justify-center h-full text-amber-200">
                <Wand className="w-12 h-12 mb-4 animate-pulse" />
                <p className="text-lg">Initializing Magic...</p>
              </div>
            )}
            {latestImage && (
              <img
                src={latestImage}
                alt="The current scene in your Hogwarts adventure"
                className="w-full h-full object-cover"
              />
            )}
            {isLoading && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-amber-200">
                <LoaderCircle className="w-10 h-10 animate-spin mb-3" />
                <p>Casting a vision...</p>
              </div>
            )}
          </div>

          <div className="flex-grow overflow-y-auto p-4 sm:p-6 text-base sm:text-lg leading-relaxed">
            {history.map((turn, index) => (
              <div
                key={index}
                className={`mb-4 ${
                  turn.isUserInput ? 'text-right' : 'text-left'
                }`}>
                {turn.isUserInput ? (
                  <p className="inline-block bg-sky-900/70 rounded-lg px-4 py-2 italic">
                    {turn.text}
                  </p>
                ) : (
                  <p>{turn.text}</p>
                )}
              </div>
            ))}
            <div ref={storyEndRef} />
            {error && (
              <p className="text-red-400 p-3 bg-red-900/50 rounded-md">
                <strong>Error:</strong> {error}
              </p>
            )}
          </div>
        </section>

        <form onSubmit={handleSubmit} className="mt-4 w-full">
          <div className="relative">
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder={
                isGameOver ? 'The adventure is over.' : 'What do you do?'
              }
              className="w-full p-3 sm:p-4 pr-12 sm:pr-14 text-slate-200 bg-slate-800 border-2 border-slate-600 rounded-lg focus:ring-2 focus:ring-amber-300 focus:outline-none transition-all placeholder:text-slate-500 disabled:bg-slate-700"
              disabled={isLoading || isGameOver}
              aria-label="Enter your action"
            />
            <button
              type="submit"
              disabled={isLoading || isGameOver || !userInput.trim()}
              className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-amber-300 text-slate-900 hover:bg-amber-200 disabled:bg-slate-600 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
              aria-label="Send action">
              {isLoading ? (
                <LoaderCircle className="w-5 h-5 animate-spin" />
              ) : (
                <SendHorizontal className="w-5 h-5" />
              )}
            </button>
          </div>
        </form>
      </main>

      {isGameOver && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-800 border-2 border-amber-300 rounded-lg shadow-2xl max-w-md w-full p-6 text-center">
            <h3 className="text-2xl font-bold text-amber-200 mb-2 font-mega">
              Game Over
            </h3>
            <p className="text-slate-300 mb-6">{gameOverReason}</p>
            <button
              onClick={startGame}
              className="bg-amber-300 text-slate-900 font-bold py-2 px-6 rounded-lg hover:bg-amber-200 transition-colors">
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
