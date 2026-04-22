#!/usr/bin/env python3
"""Command Guard — Blocks dangerous shell commands.
Exit code 2 = BLOCK.
Exit code 0 = PASS.
"""
import sys
import json
import re

BLOCKED_PATTERNS = [
    r'rm\s+-rf\s+/',
    r'rm\s+-rf\s+/\*',
    r'git\s+push\s+--force',
    r'git\s+push\s+-f\s',
    r'sudo\s+',
    r'chmod\s+777',
    r'curl.*\|.*bash',
    r'wget.*\|.*sh',
    r'mkfs\s+',
    r'dd\s+if=',
    r':(){ :|:& };:',
    r'> /dev/sd',
]

def main():
    try:
        data = json.load(sys.stdin)
        tool_input = data.get('tool_input', {})
        command = tool_input.get('command', '') if isinstance(tool_input, dict) else str(tool_input)

        for pattern in BLOCKED_PATTERNS:
            if re.search(pattern, command, re.IGNORECASE):
                print(f"BLOCKED: Dangerous command detected matching pattern: {pattern}", file=sys.stderr)
                sys.exit(2)

        sys.exit(0)
    except Exception as e:
        print(f"Command guard error: {e}", file=sys.stderr)
        sys.exit(0)

if __name__ == '__main__':
    main()
