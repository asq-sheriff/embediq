import 'dotenv/config';
import express from 'express';
import { classify } from './classifier.js';
import { generateLocal } from './local-client.js';
import { generateHosted } from './hosted-client.js';
import { logRouting } from './audit.js';
import { redactPhi } from './redactor.js';
import { scoreConfidence } from './confidence.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

interface RouteRequestBody {
  prompt: string;
  backend?: 'anthropic' | 'openai';
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/route', async (req, res) => {
  const started = Date.now();
  const { prompt, backend }: RouteRequestBody = req.body ?? {};
  if (typeof prompt !== 'string' || prompt.length === 0) {
    res.status(400).json({ error: 'prompt is required' });
    return;
  }

  try {
    const decision = classify(prompt);

    if (decision.destination === 'local') {
      const response = await generateLocal({ prompt });

      // Confidence self-evaluation — re-route when the local answer's
      // self-score falls below ROUTER_CONFIDENCE_THRESHOLD.
      if (decision.destination === 'local') {
        const score = await scoreConfidence({
          prompt,
          answer: response.text,
          model: response.model,
        });
        const threshold = Number.parseFloat(process.env.ROUTER_CONFIDENCE_THRESHOLD ?? '0.55');
        if (score < threshold) {
          const escalatePrompt = redactPhi(prompt);
          const escalated = await generateHosted({ prompt: escalatePrompt, backend: req.body.backend });
          logRouting({
            promptForAudit: prompt,
            destination: 'hosted',
            reason: 'confidence-escalation',
            confidence: score,
            latencyMs: Date.now() - started,
            model: escalated.model,
          });
          res.json({ text: escalated.text, route: 'hosted', confidence: score });
          return;
        }
      }
      logRouting({
        promptForAudit: prompt,
        destination: 'local',
        reason: decision.reason,
        latencyMs: Date.now() - started,
        model: response.model,
      });
      res.json({ text: response.text, route: 'local' });
      return;
    }

    // Hosted path — redact before any escalation.
      const redacted = redactPhi(prompt);
    const response = await generateHosted({ prompt: redacted, backend });
    logRouting({
      promptForAudit: prompt,
      destination: 'hosted',
      reason: decision.reason,
      latencyMs: Date.now() - started,
      model: response.model,
    });
    res.json({ text: response.text, route: 'hosted' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logRouting({
      promptForAudit: prompt,
      destination: 'error',
      reason: 'exception',
      latencyMs: Date.now() - started,
      model: 'n/a',
      error: message,
    });
    res.status(500).json({ error: message });
  }
});

const port = Number.parseInt(process.env.ROUTER_PORT ?? '8787', 10);
app.listen(port, () => {
  console.log(`[router] listening on http://localhost:${port}`);
});
