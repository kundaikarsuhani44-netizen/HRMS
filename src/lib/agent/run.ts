import { generateText, stepCountIs, tool, type ModelMessage, type ToolSet } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { Actor } from '../services/actor';
import { MAX_TOOL_CALLS, runTool, systemPrompt, toolNamesFor, TOOL_DEFS, type DraftCard, type ToolCallRecord, type ToolContext } from './tools';

export interface ChatTurn { role: 'user' | 'assistant'; content: string }
export interface AgentReply {
  text: string;
  calls: { tool: string; input: unknown; ok: boolean }[];
  drafts: DraftCard[];
  error?: string;
}

export const agentConfigured = () => !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;

// A reply that states leave numbers without having called any tool is not trusted.
const NUMBER_CLAIM = /\b\d+(\.\d+)?\s*(day|days|din|CL|SL|EL|leave|chutti|balance)\b/i;

/**
 * One question → up to MAX_TOOL_CALLS tool calls → one answer.
 * Only the visible chat text (no tool results, no sensitive data) is sent back as history.
 */
export async function askAgent(actor: Actor, history: ChatTurn[], question: string): Promise<AgentReply> {
  const ctx: ToolContext = { actor, question, calls: [] as ToolCallRecord[], drafts: [] };
  if (!agentConfigured()) {
    return { text: 'The assistant is not configured on this server (GOOGLE_GENERATIVE_AI_API_KEY is missing). Every screen still works.', calls: [], drafts: [], error: 'not_configured' };
  }
  const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });
  const tools: ToolSet = {};
  for (const name of toolNamesFor(actor)) {
    const def = TOOL_DEFS[name];
    tools[name] = tool({
      description: def.description,
      inputSchema: def.input as never,
      execute: async (input: unknown) => runTool(name, input, ctx),
    });
  }
  const messages: ModelMessage[] = [
    ...history.slice(-8).map((t) => ({ role: t.role, content: t.content.slice(0, 2000) }) as ModelMessage),
    { role: 'user', content: question.slice(0, 2000) },
  ];
  try {
    const res = await generateText({
      model: google(process.env.AGENT_MODEL || 'gemini-2.5-flash'),
      system: systemPrompt(actor),
      messages,
      tools,
      stopWhen: stepCountIs(MAX_TOOL_CALLS + 1),
      temperature: 0.2,
    });
    let text = res.text.trim();
    if (!text) text = ctx.calls.length >= MAX_TOOL_CALLS
      ? 'I hit my limit of 5 lookups for one question. Could you ask about one thing at a time?'
      : 'Sorry, I could not work that out. Please rephrase.';
    if (ctx.calls.length === 0 && NUMBER_CLAIM.test(text)) {
      text = 'I can only give numbers I have looked up, and I did not look anything up for that. Please ask again, e.g. "How many CL do I have?"';
    }
    return { text, calls: ctx.calls.map(({ tool, input, ok }) => ({ tool, input, ok })), drafts: ctx.drafts };
  } catch (e) {
    console.error('[agent]', e);
    const msg = (e as Error).message ?? '';
    return {
      text: /quota|rate|429/i.test(msg) ? 'The free AI quota is used up for now. Please try again in a minute — or use the screens directly.' : 'The assistant could not answer just now. Please try again.',
      calls: ctx.calls.map(({ tool, input, ok }) => ({ tool, input, ok })), drafts: ctx.drafts, error: 'model_error',
    };
  }
}
