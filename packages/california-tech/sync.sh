#!/bin/bash
# Convenience script to trigger Notion sync on local dev server

# Load CRON_SECRET from .env if not set
if [ -z "$CRON_SECRET" ]; then
  if [ -f .env ]; then
    export $(grep -v '^#' .env | grep CRON_SECRET | xargs)
  fi
fi

# Check if CRON_SECRET is set
if [ -z "$CRON_SECRET" ]; then
  echo "Error: CRON_SECRET not set in environment or .env file"
  exit 1
fi

# Base URL
BASE_URL="http://localhost:5173/api/sync"

# Build query params
PARAMS=""

# Add optional parameters
if [ -n "$1" ]; then
  PARAMS="limit=$1"
fi

if [ -n "$DATABASE" ]; then
  [ -n "$PARAMS" ] && PARAMS="$PARAMS&"
  PARAMS="${PARAMS}database=$DATABASE"
fi

if [ -n "$SINCE" ]; then
  [ -n "$PARAMS" ] && PARAMS="$PARAMS&"
  PARAMS="${PARAMS}since=$SINCE"
fi

if [ "$SYNC_ALL" = "true" ]; then
  [ -n "$PARAMS" ] && PARAMS="$PARAMS&"
  PARAMS="${PARAMS}syncAll=true"
fi

if [ "$WIPE" = "true" ]; then
  [ -n "$PARAMS" ] && PARAMS="$PARAMS&"
  PARAMS="${PARAMS}wipe=true"
fi

# Build full URL
FULL_URL="$BASE_URL"
if [ -n "$PARAMS" ]; then
  FULL_URL="$FULL_URL?$PARAMS"
fi

# Make request with Authorization header
echo "Triggering sync: $FULL_URL"
RESPONSE=$(curl -s -H "Authorization: Bearer $CRON_SECRET" "$FULL_URL")

# Try to parse as JSON, fallback to raw output if it fails
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
