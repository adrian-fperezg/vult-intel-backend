#!/bin/bash

# Pre-deployment guard: Ensure legacy "Bypass keyword matched" string is NOT in the codebase.
# This prevents regression of the old Smart Intent logic.

SEARCH_STRING="Bypass keyword matched"
MATCHES=$(grep -rn "$SEARCH_STRING" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.gemini --exclude=grep-guard.sh)

if [ ! -z "$MATCHES" ]; then
    echo "ERROR: Legacy Smart Intent logic detected!"
    echo "Found '$SEARCH_STRING' in the following locations:"
    echo "$MATCHES"
    echo "Please remove the legacy code before deploying."
    exit 1
else
    echo "SUCCESS: No legacy Smart Intent logic found. Deployment guard passed."
    exit 0
fi
