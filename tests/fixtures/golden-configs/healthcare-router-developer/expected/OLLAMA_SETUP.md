# Ollama Setup

Ollama is the local-model runtime EmbedIQ wires your IDE assistants against. Install it once on each developer machine; the IDE configs this run produced will talk to `http://localhost:11434` automatically.

## 1. Install Ollama

### macOS
```bash
brew install ollama
brew services start ollama
```

### Linux
```bash
curl -fsSL https://ollama.com/install.sh | sh
systemctl --user enable --now ollama
```

### Verify the runtime
```bash
ollama --version
curl -s http://localhost:11434/api/tags | head -20
```

## 2. Pull the models you selected

```bash
ollama pull qwen2.5-coder:32b
ollama pull nomic-embed-text
```

## 3. Hardware tuning notes

**64 GB RAM**: 32B models fit cleanly. Run two side-by-side (e.g. a coder model for autocomplete plus a general model for chat) without OS pressure.

## 4. IDE wiring

EmbedIQ already produced configs for: **Continue.dev, Aider**. Restart each IDE after installing it; the configs above will be picked up automatically.

- **Continue.dev**: install the extension from your IDE's marketplace; the config lives at `.continue/config.json`.
- **Aider**: `pip install aider-install && aider-install`; run `aider` in the project root and it will pick up `.aider.conf.yml`.

## 5. Validate end-to-end

```bash
ollama run qwen2.5-coder:32b "Reply with the word ready."
```

A clean "ready." response means the runtime, the model, and your hardware are all working.

## HIPAA reminder

Local Ollama models do not transmit prompts off-machine, but the model weights themselves were downloaded from a public registry. For BAA-scoped workloads, mirror the registry inside your network and pull from the mirror.
