export type ProviderProtocol = 'responses' | 'chat_completions' | 'anthropic_messages';

export type ProtocolModel = {
  baseUrl: string;
  model: string;
  apiKey: string;
  protocol: ProviderProtocol;
  reasoningEffort?: string;
};

export type ProviderRequestInput = {
  systemPrompt?: string;
  prompt: string;
  imageUrl?: string;
  maxTokens: number;
  temperature?: number;
  jsonOutput?: boolean;
};

export function protocolLabel(protocol: ProviderProtocol | string): string {
  if (protocol === 'anthropic_messages') return 'Anthropic Messages API';
  if (protocol === 'chat_completions') return 'Chat Completions';
  return 'Responses API';
}

export function isProviderProtocol(value: unknown): value is ProviderProtocol {
  return value === 'responses' || value === 'chat_completions' || value === 'anthropic_messages';
}

function apiRoot(raw: string) {
  const url = new URL(raw);
  const base = url.toString().replace(/\/$/, '');
  return /\/v\d+$/i.test(url.pathname) ? base : `${base}/v1`;
}

function imageParts(imageUrl: string | undefined, protocol: ProviderProtocol) {
  if (!imageUrl) return [];
  if (protocol === 'responses') return [{ type: 'input_image', image_url: imageUrl }];
  if (protocol === 'chat_completions') return [{ type: 'image_url', image_url: { url: imageUrl } }];
  const match = imageUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) return [];
  return [{ type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } }];
}

export function buildProviderRequest(model: ProtocolModel, input: ProviderRequestInput) {
  const { protocol } = model;
  const url = `${apiRoot(model.baseUrl)}${protocol === 'responses' ? '/responses' : protocol === 'chat_completions' ? '/chat/completions' : '/messages'}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  let body: Record<string, unknown>;
  if (protocol === 'anthropic_messages') {
    headers['x-api-key'] = model.apiKey;
    headers['anthropic-version'] = '2023-06-01';
    const content = input.imageUrl
      ? [{ type: 'text', text: input.prompt }, ...imageParts(input.imageUrl, protocol)]
      : input.prompt;
    body = { model: model.model, ...(input.systemPrompt ? { system: input.systemPrompt } : {}), messages: [{ role: 'user', content }], max_tokens: input.maxTokens, ...(input.temperature === undefined ? {} : { temperature: input.temperature }) };
  } else if (protocol === 'responses') {
    headers.Authorization = `Bearer ${model.apiKey}`;
    const userContent = [{ type: 'input_text', text: input.prompt }, ...imageParts(input.imageUrl, protocol)];
    body = { model: model.model, input: [{ role: 'system', content: [{ type: 'input_text', text: input.systemPrompt || '' }] }, { role: 'user', content: userContent }], ...(model.reasoningEffort ? { reasoning: { effort: model.reasoningEffort } } : {}), max_output_tokens: input.maxTokens };
  } else {
    headers.Authorization = `Bearer ${model.apiKey}`;
    const content = input.imageUrl ? [{ type: 'text', text: input.prompt }, ...imageParts(input.imageUrl, protocol)] : input.prompt;
    body = { model: model.model, messages: [{ role: 'system', content: input.systemPrompt || '' }, { role: 'user', content }], ...(input.temperature === undefined ? {} : { temperature: input.temperature }), ...(input.jsonOutput ? { response_format: { type: 'json_object' } } : {}), max_tokens: input.maxTokens };
  }
  return { url, headers, body };
}

export function extractProviderText(payload: unknown, protocol: ProviderProtocol): string {
  const body = payload as Record<string, unknown> | null;
  if (!body) return '';
  if (protocol === 'responses') {
    if (typeof body.output_text === 'string') return body.output_text;
    const output = Array.isArray(body.output) ? body.output : [];
    return output.flatMap((item) => {
      const content = item && typeof item === 'object' && Array.isArray((item as { content?: unknown }).content) ? (item as { content: unknown[] }).content : [];
      return content.map((part) => part && typeof part === 'object' ? String((part as { text?: unknown }).text || '') : '');
    }).join('');
  }
  if (protocol === 'anthropic_messages') {
    const content = Array.isArray(body.content) ? body.content : [];
    return content.map((part) => part && typeof part === 'object' ? String((part as { text?: unknown }).text || '') : '').join('');
  }
  const choices = Array.isArray(body.choices) ? body.choices : [];
  const message = choices[0] && typeof choices[0] === 'object' ? (choices[0] as { message?: { content?: unknown } }).message : undefined;
  if (typeof message?.content === 'string') return message.content;
  if (Array.isArray(message?.content)) return message.content.map((part) => part && typeof part === 'object' ? String((part as { text?: unknown }).text || '') : '').join('');
  return '';
}
