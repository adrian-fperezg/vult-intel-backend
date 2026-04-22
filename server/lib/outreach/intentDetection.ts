import { GoogleGenAI } from "@google/genai";

const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

/**
 * Categorizes a lead's reply intent using AI.
 */
export async function analyzeLeadIntent(body: string): Promise<{ intent: string; score: number }> {
  if (!GEMINI_KEY || !body) {
    return { intent: 'General Inquiry', score: 0.5 };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

    const prompt = `
      You are an expert sales development representative. Analyze the following lead reply and categorize it into EXACTLY ONE of these categories:
      - Interested (Positive interest, asking for info, but no specific meeting mentioned)
      - Meeting Requested (Explicitly wants a call, demo, or meeting)
      - Not Interested (Rejection, stop, no thanks, not for us)
      - Wait / Later (Follow up in a month, not right now, busy season)
      - Wrong Person (I'm not the right person, speak to X instead)
      - General Inquiry (Questions, out of office, automated replies, or neutral comments)

      Reply MUST be a valid JSON object with the format:
      {
        "intent": "Category Name",
        "score": 0.0 to 1.0 (Confidence score where 1.0 is certain)
      }

      LEAD REPLY:
      """
      ${body.slice(0, 2000)}
      """
    `;

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: prompt
    });
    const text = response.text || "";
    
    // Extract JSON from markdown code block if present
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Could not parse AI response");
    
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      intent: parsed.intent || 'General Inquiry',
      score: parsed.score || 0.5
    };
  } catch (err) {
    console.error("[Intent Detection Error]:", err);
    return { intent: 'General Inquiry', score: 0.0 };
  }
}
