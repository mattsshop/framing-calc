
import { GoogleGenAI } from "@google/genai";
import type { Wall, Opening } from '../types';

// Declare process to satisfy TypeScript in browser environments where types/node might be missing
declare const process: any;

// Vite exposes env variables via import.meta.env. VITE_ prefix is required for client-side exposure.
// We fallback to process.env for local Node/compatible environments, safely checking if process exists.
const viteEnv = (import.meta as any).env;
const processEnv = typeof process !== 'undefined' ? process.env : {};
const apiKey = viteEnv?.VITE_API_KEY || processEnv?.API_KEY;

const ai = new GoogleGenAI({ apiKey: apiKey as string });

function formatOpeningsForPrompt(openings: Opening[], type: string): string {
    if (openings.length === 0 || openings.every(o => o.quantity === 0)) {
        return `No ${type}s.`;
    }
    const details = openings
        .filter(op => op.quantity > 0)
        .map(op => `${op.quantity}x ${op.width}"w x ${op.height}"h with ${op.headerSize} headers`).join('; ');
    return `${type}s: ${details}`;
}

export async function getProTip(walls: Wall[]): Promise<string> {
  
  const totalLinearFeet = walls.reduce((acc, wall) => acc + wall.details.wallLength, 0) / 12;
  const uniqueWallConfigs = new Map<string, number>();
  walls.forEach(wall => {
      const configKey = `${wall.details.wallHeight}-${wall.details.studSize}-${wall.details.studSpacing}`;
      uniqueWallConfigs.set(configKey, (uniqueWallConfigs.get(configKey) || 0) + 1);
  });
  
  const summary = `
    You are a master framing carpenter providing advice for a multi-wall project. Based on the following project summary, 
    provide a single, concise, and actionable "Pro Tip" for the builder. The tip should focus on efficiency, consistency, 
    or a common pitfall when dealing with multiple walls, like in a hotel or apartment building. Keep it to one or two short paragraphs.
    Do not use markdown formatting.

    **Project Summary:**
    - Total Number of Walls: ${walls.length}
    - Total Linear Feet of Walls: ~${Math.round(totalLinearFeet)} ft
    - Wall Configurations: ${walls.length > 0 ? `${Array.from(uniqueWallConfigs.entries()).map(([key, count]) => `${count} walls at ${key.split('-')[0]}" height with ${key.split('-')[1]}s at ${key.split('-')[2]}" O.C.`).join(', ')}` : 'N/A'}
    - A typical wall includes: ${walls.length > 0 ? `${formatOpeningsForPrompt(walls[0].details.openings.filter(o => o.type === 'window'), 'Window')} & ${formatOpeningsForPrompt(walls[0].details.openings.filter(o => o.type === 'door'), 'Door')}` : 'No openings defined.'}
  `;

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: summary,
    });
    return response.text as string;
  } catch (error) {
    console.error("Error fetching pro tip from Gemini:", error);
    return "Could not retrieve a pro tip at this time. Please check your API key and connection.";
  }
}
