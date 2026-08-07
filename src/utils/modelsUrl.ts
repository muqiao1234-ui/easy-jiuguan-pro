/** Build the OpenAI-compatible model listing endpoint from a configured channel URL. */
export function modelsUrl(baseUrl: string): string {
  let url = baseUrl.trim().replace(/\/+$/, '');
  if (!url) return '';
  if (url.endsWith('/chat/completions')) return `${url.slice(0, -'/chat/completions'.length)}/models`;
  if (url.endsWith('/v1')) return `${url}/models`;
  return `${url}/v1/models`;
}
