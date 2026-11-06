// A small client for Google's Gemini API. The key lives only in the server's environment (GEMINI_API_KEY).
const MODEL = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const configured = () => !!process.env.GEMINI_API_KEY;

async function generate({ system, turns, maxTokens = 700 }) {
  if (!configured()) throw Object.assign(new Error('The AI helper is not switched on for this server.'), { code: 'OFF' });
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: turns.map((t) => ({ role: t.role === 'model' ? 'model' : 'user', parts: [{ text: t.text }] })),
    generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } }
  });
  let res;
  // Google answers 429/500/503 now and then when it is busy: one more try after a short pause is usually enough.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, body, signal: AbortSignal.timeout(25000)
      });
    } catch (e) { throw Object.assign(new Error('The AI helper did not answer in time. Try again in a moment.'), { code: 'TIMEOUT' }); }
    if (![429, 500, 503].includes(res.status) || attempt === 1) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  if ([429, 503].includes(res.status)) { console.error(`gemini: HTTP ${res.status}`); throw Object.assign(new Error('The AI helper is busy right now. Try again in a minute.'), { code: 'BUSY' }); }
  if (!res.ok) { console.error(`gemini: HTTP ${res.status}`); throw Object.assign(new Error('The AI helper is not available right now.'), { code: 'FAILED' }); }
  const data = await res.json();
  const text = ((data.candidates || [])[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
  if (!text) throw Object.assign(new Error('The AI helper had nothing to say. Try asking in a different way.'), { code: 'EMPTY' });
  return text;
}

module.exports = { generate, configured };
