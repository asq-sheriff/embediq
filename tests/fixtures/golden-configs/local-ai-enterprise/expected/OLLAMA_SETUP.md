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
ollama pull qwen3.5:35b-a3b
ollama pull llama3.1:8b
ollama pull nomic-embed-text
```

## 3. Hardware tuning notes

**Dedicated NVIDIA GPU**: Ollama auto-detects CUDA; verify with `nvidia-smi` while a model is loaded. Larger context windows (`OLLAMA_CONTEXT_SIZE=32768`) are practical with 24GB+ VRAM.

## 4. IDE wiring

EmbedIQ already produced configs for: **Continue.dev, Aider, Zed AI**. Restart each IDE after installing it; the configs above will be picked up automatically.

- **Continue.dev**: install the extension from your IDE's marketplace; the config lives at `.continue/config.json`.
- **Aider**: `pip install aider-install && aider-install`; run `aider` in the project root and it will pick up `.aider.conf.yml`.
- **Zed**: open the project in Zed; assistant settings load from `.zed/settings.json`.

## 5. Validate end-to-end

```bash
ollama run qwen3.5:35b-a3b "Reply with the word ready."
```

A clean "ready." response means the runtime, the model, and your hardware are all working.
