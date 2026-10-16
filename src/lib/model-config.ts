export function modelConfig(prefix: 'OPENAI' | 'LLM') {
  const other = prefix === 'OPENAI' ? 'LLM' : 'OPENAI';
  return Object.fromEntries(['API_KEY', 'BASE_URL', 'MODEL'].map(key => [key, process.env[`${prefix}_${key}`]?.trim() || process.env[`${other}_${key}`]?.trim()]));
}
