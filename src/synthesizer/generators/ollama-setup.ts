import type { ConfigGenerator } from '../generator.js';
import { TargetFormat } from '../target-format.js';
import type { GenerationContext, GeneratedFile, UserProfile } from '../../types/index.js';

/**
 * Ollama setup generator — emits a root-level `OLLAMA_SETUP.md` runbook
 * with install instructions, model-pull commands tailored to the user's
 * selected models, and hardware-aware tuning notes from `profile.hardwareProfile`.
 *
 * Runs whenever the user has opted into local AI (TECH_013), regardless
 * of which IDE integrations they picked — Ollama itself is the runtime.
 */
export class OllamaSetupGenerator implements ConfigGenerator {
  name = 'ollama-setup';
  target = TargetFormat.OLLAMA;

  generate(config: GenerationContext): GeneratedFile[] {
    const { profile } = config;
    const models = profile.ollamaModels ?? [];
    const ides = profile.ideIntegrations ?? [];
    const ram = profile.hardwareProfile.ram ?? '';

    const lines: string[] = [];
    lines.push('# Ollama Setup');
    lines.push('');
    lines.push(
      'Ollama is the local-model runtime EmbedIQ wires your IDE assistants ' +
        'against. Install it once on each developer machine; the IDE configs ' +
        'this run produced will talk to `http://localhost:11434` automatically.',
    );
    lines.push('');

    lines.push('## 1. Install Ollama');
    lines.push('');
    lines.push('### macOS');
    lines.push('```bash');
    lines.push('brew install ollama');
    lines.push('brew services start ollama');
    lines.push('```');
    lines.push('');
    lines.push('### Linux');
    lines.push('```bash');
    lines.push('curl -fsSL https://ollama.com/install.sh | sh');
    lines.push('systemctl --user enable --now ollama');
    lines.push('```');
    lines.push('');
    lines.push('### Verify the runtime');
    lines.push('```bash');
    lines.push('ollama --version');
    lines.push('curl -s http://localhost:11434/api/tags | head -20');
    lines.push('```');
    lines.push('');

    lines.push('## 2. Pull the models you selected');
    lines.push('');
    if (models.length > 0) {
      lines.push('```bash');
      for (const m of models) {
        lines.push(`ollama pull ${m}`);
      }
      lines.push('```');
    } else {
      lines.push('No models were selected in the wizard. A reasonable starter set:');
      lines.push('```bash');
      lines.push('ollama pull qwen2.5-coder:32b   # coding tasks');
      lines.push('ollama pull llama3.1:8b         # fast general-purpose');
      lines.push('ollama pull nomic-embed-text    # embeddings');
      lines.push('```');
    }
    lines.push('');

    lines.push('## 3. Hardware tuning notes');
    lines.push('');
    lines.push(hardwareNotes(ram));
    lines.push('');

    if (ides.length > 0) {
      lines.push('## 4. IDE wiring');
      lines.push('');
      lines.push(
        `EmbedIQ already produced configs for: **${ides
          .map(humanIde)
          .join(', ')}**. Restart each IDE after installing it; the configs above ` +
          'will be picked up automatically.',
      );
      lines.push('');
      if (ides.includes('continue-dev')) {
        lines.push('- **Continue.dev**: install the extension from your IDE\'s marketplace; the config lives at `.continue/config.json`.');
      }
      if (ides.includes('aider')) {
        lines.push('- **Aider**: `pip install aider-install && aider-install`; run `aider` in the project root and it will pick up `.aider.conf.yml`.');
      }
      if (ides.includes('zed-ai')) {
        lines.push('- **Zed**: open the project in Zed; assistant settings load from `.zed/settings.json`.');
      }
      lines.push('');
    }

    lines.push('## 5. Validate end-to-end');
    lines.push('');
    lines.push('```bash');
    lines.push(`ollama run ${profile.defaultLocalModel ?? models[0] ?? 'llama3.1:8b'} "Reply with the word ready."`);
    lines.push('```');
    lines.push('');
    lines.push('A clean "ready." response means the runtime, the model, and your hardware are all working.');
    lines.push('');

    if (profile.complianceFrameworks.includes('hipaa')) {
      lines.push('## HIPAA reminder');
      lines.push('');
      lines.push(
        'Local Ollama models do not transmit prompts off-machine, but the model ' +
          'weights themselves were downloaded from a public registry. For BAA-scoped ' +
          'workloads, mirror the registry inside your network and pull from the mirror.',
      );
      lines.push('');
    }

    return [
      {
        relativePath: 'OLLAMA_SETUP.md',
        content: lines.join('\n'),
        description: 'Ollama install + model-pull runbook (OLLAMA_SETUP.md)',
      },
    ];
  }
}

/** Exposed for tests. */
export function shouldEmitOllamaSetup(profile: UserProfile): boolean {
  return profile.localAiEnabled === true;
}

function humanIde(id: string): string {
  switch (id) {
    case 'continue-dev':
      return 'Continue.dev';
    case 'aider':
      return 'Aider';
    case 'zed-ai':
      return 'Zed AI';
    default:
      return id;
  }
}

function hardwareNotes(ram: string): string {
  switch (ram) {
    case '16gb':
      return (
        '**16 GB RAM**: large coder models (32B+) will swap heavily — stick to 7-8B ' +
        'general models and 8B coder variants. Consider `qwen2.5-coder:7b` instead of `:32b`.'
      );
    case '32gb':
      return (
        '**32 GB RAM**: comfortable for 8-13B models. 30B models run but slowly. ' +
        'A reasonable mix is `qwen2.5-coder:7b` for autocomplete and `llama3.1:8b` for chat.'
      );
    case '64gb':
      return (
        '**64 GB RAM**: 32B models fit cleanly. Run two side-by-side (e.g. a coder ' +
        'model for autocomplete plus a general model for chat) without OS pressure.'
      );
    case '128gb+':
      return (
        '**128 GB+ RAM (e.g. M-series Max / Studio)**: full 70B models fit in memory; ' +
        'consider `qwen3.5:35b-a3b` or `llama3.3:70b` as the chat default. MLX / NVFP4 ' +
        'quantized builds are noticeably faster on Apple Silicon — see Ollama 0.19+ release notes.'
      );
    case 'gpu':
      return (
        '**Dedicated NVIDIA GPU**: Ollama auto-detects CUDA; verify with `nvidia-smi` ' +
        'while a model is loaded. Larger context windows (`OLLAMA_CONTEXT_SIZE=32768`) ' +
        'are practical with 24GB+ VRAM.'
      );
    default:
      return (
        'Pick model sizes based on your machine\'s available RAM. As a rough rule: ' +
        '7-8B models need ~6 GB, 30B models need ~20 GB, 70B models need ~40 GB.'
      );
  }
}
