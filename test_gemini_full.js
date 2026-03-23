import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
dotenv.config();

const SYSTEM_INSTRUCTION = `You are a world-class Chief Marketing Officer (CMO)...
The output must be a RAW JSON object.`;

async function test() {
    const ai = new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY });
    console.log("Testing Full API Call...");
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: "Analyze the following website URL: https://hydrousmgmt.com/",
            config: {
                systemInstruction: SYSTEM_INSTRUCTION
            }
        });
        console.log("Success! Response text length:", response.text?.length);
        console.log(response.text?.substring(0, 500));
    } catch (err) {
        console.error("Test Error:", err);
    }
}

test();
