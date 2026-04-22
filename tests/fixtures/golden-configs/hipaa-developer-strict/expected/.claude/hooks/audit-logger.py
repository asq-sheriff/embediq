#!/usr/bin/env python3
"""Audit Logger — Logs all Claude Code tool actions for compliance.
Log destination: local_file
"""
import sys
import json
import os
from datetime import datetime, timezone

LOG_DIR = os.path.join(os.environ.get('CLAUDE_PROJECT_DIR', '.'), '.claude', 'logs')

def main():
    try:
        os.makedirs(LOG_DIR, exist_ok=True)
        data = json.load(sys.stdin)

        log_entry = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'user': os.environ.get('USER', 'unknown'),
            'tool': data.get('tool_name', 'unknown'),
            'tool_input_summary': _summarize_input(data.get('tool_input', {})),
            'session_id': os.environ.get('CLAUDE_SESSION_ID', 'unknown'),
        }

        log_file = os.path.join(LOG_DIR, f"audit-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.jsonl")
        with open(log_file, 'a') as f:
            f.write(json.dumps(log_entry) + '\n')

    except Exception as e:
        print(f"Audit logger error: {e}", file=sys.stderr)

    sys.exit(0)  # Never block

def _summarize_input(tool_input):
    """Summarize tool input without including sensitive content."""
    if isinstance(tool_input, dict):
        summary = {}
        for key, value in tool_input.items():
            if key in ('command', 'file_path', 'pattern'):
                summary[key] = str(value)[:200]
            else:
                summary[key] = f"[{type(value).__name__}, {len(str(value))} chars]"
        return summary
    return f"[{type(tool_input).__name__}]"

if __name__ == '__main__':
    main()
