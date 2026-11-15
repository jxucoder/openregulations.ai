#!/usr/bin/env bash
# Manage OpenRegulations secrets with 1Password as the source of truth.
#
# Every secret lives as an "API Credential" item in one vault (default:
# "openregulations"), with the value in the item's `credential` field.
# GitHub Actions and the Cloudflare Worker get copies pushed from there.
#
#   scripts/secrets.sh import [ENV_FILE]   Create the vault and store each secret from ENV_FILE
#                                          (default .env); prompts, hidden, for any that are missing.
#   scripts/secrets.sh status              Show which secrets exist in the vault (names only)
#   scripts/secrets.sh push-github         Copy secrets from 1Password to GitHub Actions
#   scripts/secrets.sh push-worker         Copy secrets from 1Password to the Cloudflare Worker
#
# Requires: op (signed in), jq; gh for push-github; npx/wrangler for push-worker.
# Values travel via stdin only. They are never echoed or passed as command arguments.
# Set OP_VAULT to use a different vault, FORCE=1 to overwrite items that already exist.

set -euo pipefail

VAULT="${OP_VAULT:-openregulations}"
REPO="${GH_REPO:-jxucoder/openregulations.ai}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# 1Password item name | where to get it
SECRETS=(
  "ANTHROPIC_API_KEY|https://console.anthropic.com/settings/keys"
  "REGULATIONS_API_KEY|https://api.data.gov/signup/"
  "OPENAI_API_KEY|https://platform.openai.com/api-keys"
  "SUPABASE_URL|Supabase > Project Settings > API"
  "SUPABASE_PUBLISHABLE_KEY|Supabase > Project Settings > API Keys"
  "SUPABASE_SECRET_KEY|Supabase > Project Settings > API Keys"
  "CLOUDFLARE_API_TOKEN|https://dash.cloudflare.com/profile/api-tokens"
  "CLOUDFLARE_ACCOUNT_ID|Cloudflare dashboard > Account home"
)

# GitHub Actions secret name | 1Password item (names used by .github/workflows/*.yml)
GITHUB_MAP=(
  "ANTHROPIC_API_KEY|ANTHROPIC_API_KEY"
  "REGULATIONS_API_KEY|REGULATIONS_API_KEY"
  "SUPABASE_URL|SUPABASE_URL"
  "SUPABASE_SERVICE_KEY|SUPABASE_SECRET_KEY"
  "SUPABASE_PUBLISHABLE_KEY|SUPABASE_PUBLISHABLE_KEY"
  "CLOUDFLARE_API_TOKEN|CLOUDFLARE_API_TOKEN"
  "CLOUDFLARE_ACCOUNT_ID|CLOUDFLARE_ACCOUNT_ID"
)

# Worker secret name | 1Password item (read by website/worker/index.js).
# The Worker only reads public tables, so it gets the publishable key, not the secret key.
WORKER_MAP=(
  "ANTHROPIC_API_KEY|ANTHROPIC_API_KEY"
  "OPENAI_API_KEY|OPENAI_API_KEY"
  "SUPABASE_URL|SUPABASE_URL"
  "SUPABASE_KEY|SUPABASE_PUBLISHABLE_KEY"
)

die() { echo "error: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "$1 is required"; }

ensure_vault() {
  if ! op vault get "$VAULT" >/dev/null 2>&1; then
    echo "Creating vault '$VAULT'"
    op vault create "$VAULT" --description "OpenRegulations.ai project secrets" >/dev/null
  fi
}

item_exists() { op item get "$1" --vault "$VAULT" >/dev/null 2>&1; }

# Read KEY's value from an env file without sourcing it (no code execution).
env_value() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || return 0
  grep -E "^[[:space:]]*(export[[:space:]]+)?${key}=" "$file" | tail -n1 \
    | sed -E "s/^[[:space:]]*(export[[:space:]]+)?${key}=//; s/[[:space:]]+#.*$//; s/^['\"]//; s/['\"]$//" || true
}

store() {
  local name="$1" value="$2"
  if item_exists "$name"; then
    [[ "${FORCE:-0}" == 1 ]] || { echo "  $name: already in vault (FORCE=1 to replace)"; return; }
    op item delete "$name" --vault "$VAULT" --archive >/dev/null
  fi
  printf '%s' "$value" \
    | jq -Rs --arg t "$name" \
      '{title: $t, category: "API_CREDENTIAL",
        fields: [{id: "credential", type: "CONCEALED", label: "credential", value: .}]}' \
    | op item create --vault "$VAULT" --tags openregulations >/dev/null
  echo "  $name: stored"
}

cmd_import() {
  need op; need jq
  local file="${1:-$ROOT/.env}"
  ensure_vault
  echo "Importing into vault '$VAULT' from ${file}"
  for entry in "${SECRETS[@]}"; do
    local name="${entry%%|*}" hint="${entry#*|}" value
    value="$(env_value "$file" "$name")"
    # Accept the legacy name used in older .env files
    [[ -z "$value" && "$name" == SUPABASE_SECRET_KEY ]] && value="$(env_value "$file" SUPABASE_SERVICE_KEY)"
    if [[ -z "$value" || "$value" == *your-* || "$value" == *_xxx ]]; then
      if item_exists "$name" && [[ "${FORCE:-0}" != 1 ]]; then
        echo "  $name: already in vault"; continue
      fi
      read -r -s -p "  $name ($hint), Enter to skip: " value; echo
      [[ -z "$value" ]] && { echo "  $name: skipped"; continue; }
    fi
    store "$name" "$value"
  done
}

cmd_status() {
  need op
  for entry in "${SECRETS[@]}"; do
    local name="${entry%%|*}"
    if item_exists "$name"; then echo "  ok       $name"; else echo "  missing  $name"; fi
  done
}

read_secret() {
  local value
  value="$(op read "op://$VAULT/$1/credential")" || die "could not read $1 from 1Password"
  [[ -n "$value" ]] || die "$1 is empty in 1Password; refusing to push an empty secret"
  printf '%s' "$value"
}

cmd_push_github() {
  need op; need gh
  for entry in "${GITHUB_MAP[@]}"; do
    local target="${entry%%|*}" item="${entry#*|}"
    item_exists "$item" || { echo "  $target: skipped ($item not in vault)"; continue; }
    local value
    value="$(read_secret "$item")"
    printf '%s' "$value" | gh secret set "$target" --repo "$REPO" >/dev/null
    echo "  $target: set on $REPO"
  done
}

cmd_push_worker() {
  need op; need npx
  for entry in "${WORKER_MAP[@]}"; do
    local target="${entry%%|*}" item="${entry#*|}"
    item_exists "$item" || { echo "  $target: skipped ($item not in vault)"; continue; }
    local value
    value="$(read_secret "$item")"
    printf '%s' "$value" | (cd "$ROOT/website/worker" && npx --yes wrangler secret put "$target" >/dev/null)
    echo "  $target: set on Worker"
  done
}

case "${1:-}" in
  import) shift; cmd_import "$@" ;;
  status) cmd_status ;;
  push-github) cmd_push_github ;;
  push-worker) cmd_push_worker ;;
  *) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
