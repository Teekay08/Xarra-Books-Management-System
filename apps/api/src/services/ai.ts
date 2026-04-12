import Groq from 'groq-sdk';
import { config } from '../config.js';

let groqClient: Groq | null = null;

function getClient(): Groq {
  if (!groqClient) {
    const apiKey = config.ai.apiKey;
    if (!apiKey) throw new Error('GROQ_API_KEY is not configured');
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}

export function isAiConfigured(): boolean {
  return !!config.ai.apiKey;
}

interface AiSuggestionOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}

async function getAiSuggestion(options: AiSuggestionOptions): Promise<string> {
  const client = getClient();
  const completion = await client.chat.completions.create({
    model: config.ai.model,
    messages: [
      { role: 'system', content: options.systemPrompt },
      { role: 'user', content: options.userPrompt },
    ],
    max_tokens: Math.min(options.maxTokens ?? config.ai.maxTokens, config.ai.maxTokens),
    temperature: config.ai.temperature,
  });
  return completion.choices[0]?.message?.content ?? '';
}

async function getAiJsonSuggestion<T = any>(options: AiSuggestionOptions): Promise<T> {
  const text = await getAiSuggestion(options);
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
  const jsonStr = (jsonMatch[1] || text).trim();
  return JSON.parse(jsonStr);
}

// ==========================================
// DOMAIN-SPECIFIC AI HELPERS
// ==========================================

const PUBLISHING_CONTEXT = `You are an AI assistant for Xarra Books, a South African publisher.
Use concise, practical publishing guidance.
Use ZAR for money.
Respond with strict valid JSON only when JSON is requested.`;

export async function suggestProjectDetails(input: {
  bookTitle: string;
  authorName: string;
  genre?: string;
  projectType?: string;
  contractType?: string;
}) {
  return getAiJsonSuggestion({
    systemPrompt: PUBLISHING_CONTEXT,
    userPrompt: `A new book project is being created for Xarra Books. Based on the following details, suggest project information:

Book Title: "${input.bookTitle}"
Author: ${input.authorName}
${input.genre ? `Genre: ${input.genre}` : ''}
${input.projectType ? `Project Type: ${input.projectType}` : ''}
${input.contractType ? `Contract Type: ${input.contractType}` : ''}

Return a JSON object with these fields:
{
  "description": "A concise 1-2 sentence project description",
  "suggestedMilestones": [
    { "name": "Milestone Name", "estimatedWeeks": 2, "description": "Brief description" }
  ],
  "estimatedTimeline": "e.g. 6-8 months",
  "keyConsiderations": ["list of 3 key things the PM should consider"],
  "suggestedBudgetCategories": [
    { "category": "e.g. Editorial", "description": "What this covers", "estimatedRangeZAR": "e.g. R15,000 - R25,000" }
  ]
}`,
    maxTokens: 650,
  });
}

export async function suggestTaskDetails(input: {
  taskTitle: string;
  projectName: string;
  staffRole: string;
  allocatedHours: number;
}) {
  return getAiJsonSuggestion({
    systemPrompt: PUBLISHING_CONTEXT,
    userPrompt: `A project manager is creating a task assignment for a publishing project. Suggest details:

Task: "${input.taskTitle}"
Project: "${input.projectName}"
Staff Role: ${input.staffRole}
Allocated Hours: ${input.allocatedHours}

Return a JSON object with:
{
  "description": "A concise task description (4-6 sentences)",
  "deliverables": [
    { "description": "Specific deliverable item" }
  ],
  "suggestedPriority": "LOW | MEDIUM | HIGH | URGENT",
  "estimatedHours": <your estimate of how many hours this should take>,
  "tips": "2 short practical tips for the staff member"
}`,
    maxTokens: 500,
  });
}

export async function suggestSowContent(input: {
  projectName: string;
  staffName: string;
  staffRole: string;
  tasks: Array<{ title: string; hours: number; rate: number }>;
  isInternal: boolean;
}) {
  const taskList = input.tasks
    .slice(0, 8)
    .map((t, i) => `${i + 1}. ${t.title} (${t.hours}h @ R${t.rate}/hr)`)
    .join('\n');

  return getAiJsonSuggestion({
    systemPrompt: PUBLISHING_CONTEXT,
    userPrompt: `Generate a professional Statement of Work for a publishing project:

Project: "${input.projectName}"
${input.isInternal ? 'Staff Member' : 'Contractor'}: ${input.staffName} (${input.staffRole})
Tasks:
${taskList}

Return a JSON object with:
{
  "scope": "A concise scope paragraph (2-3 sentences)",
  "terms": "3 short terms, separated by newlines",
  "acceptanceCriteria": "A concise acceptance criteria paragraph"
}`,
    maxTokens: 420,
  });
}

export async function suggestDescription(input: {
  context: string;
  entityType: 'project' | 'task' | 'milestone' | 'budget_line' | 'sow';
  existingData?: Record<string, any>;
}) {
  return getAiSuggestion({
    systemPrompt: PUBLISHING_CONTEXT,
    userPrompt: `Write a concise, professional description for a ${input.entityType} in a book publishing project.

Context: ${input.context}
${input.existingData ? `Existing data: ${JSON.stringify(input.existingData)}` : ''}

Return ONLY the description text (2-3 sentences), no JSON wrapping or extra formatting.`,
    maxTokens: 180,
  });
}
