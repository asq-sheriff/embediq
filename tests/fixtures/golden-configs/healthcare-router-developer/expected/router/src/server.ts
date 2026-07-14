import 'dotenv/config';
import express from 'express';
import { classify } from './classifier.js';
import { generateLocal } from './local-client.js';
import { forwardToGateway } from './dispatch.js';
import { logRouting } from './audit.js';
import { scoreConfidence } from './confidence.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

interface RouteRequestBody {
  prompt: string;
  model?: string;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/route', async (req, res) => {
  const started = Date.now();
  const { prompt, model }: RouteRequestBody = req.body ?? {};
  if (typeof prompt !== 'string' || prompt.length === 0) {
    res.status(400).json({ error: 'prompt is required' });
    return;
  }

  try {
    const decision = classify(prompt);

    if (decision.destination === 'local') {
      const response = await generateLocal({ prompt });

      // Confidence self-evaluation — re-route when the local answer's self-score
      // falls below ROUTER_CONFIDENCE_THRESHOLD. The escalation goes to the
      // GATEWAY, which holds the credentials and enforces the egress guardrail —
      // this router never sees a provider key or the raw egress path.
      if (decision.destination === 'local') {
        const score = await scoreConfidence({ prompt, answer: response.text, model: response.model });
        const threshold = Number.parseFloat(process.env.ROUTER_CONFIDENCE_THRESHOLD ?? '0.55');
        if (score < threshold) {
          const escalated = await forwardToGateway({ prompt, model: req.body.model });
          logRouting({
            promptForAudit: prompt,
            destination: 'gateway',
            reason: 'confidence-escalation',
            confidence: score,
            latencyMs: Date.now() - started,
            model: escalated.model,
          });
          res.json({ text: escalated.text, route: 'gateway', confidence: score });
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

    // Escalation path — forward to the gateway. This router holds no
    // credentials and makes no direct provider call; the gateway executes the
    // request and enforces the PHI/PII egress guardrail before any egress.
    const response = await forwardToGateway({ prompt, model });
    logRouting({
      promptForAudit: prompt,
      destination: 'gateway',
      reason: decision.reason,
      latencyMs: Date.now() - started,
      model: response.model,
    });
    res.json({ text: response.text, route: 'gateway' });
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
