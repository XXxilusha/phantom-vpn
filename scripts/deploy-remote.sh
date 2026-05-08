#!/bin/bash
# ============================================
# Quick Deploy — Run from your local machine
# ============================================
# Usage: bash deploy-remote.sh <server-ip> [ssh-key-path]
# Example: bash deploy-remote.sh 129.213.45.67 ~/.ssh/oracle_key.pem
# ============================================

SERVER_IP="${1:?Usage: $0 <server-ip> [ssh-key-path]}"
SSH_KEY="${2:-}"
SSH_USER="${3:-ubuntu}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "╔══════════════════════════════════════╗"
echo "║  Phantom VPN — Remote Deploy         ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "Server:  $SERVER_IP"
echo "User:    $SSH_USER"
echo "Key:     ${SSH_KEY:-password auth}"
echo ""

SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10"
if [[ -n "$SSH_KEY" ]]; then
  SSH_OPTS="$SSH_OPTS -i $SSH_KEY"
fi

echo "[1/3] Testing SSH connection..."
ssh $SSH_OPTS ${SSH_USER}@${SERVER_IP} "echo 'SSH OK'" || {
  echo "ERROR: Cannot connect to server"
  exit 1
}

echo "[2/3] Uploading and running WireGuard setup..."
ssh $SSH_OPTS ${SSH_USER}@${SERVER_IP} 'bash -s' < "${SCRIPT_DIR}/deploy-wireguard.sh" | tee /tmp/phantom-deploy.log

echo "[3/3] Downloading client config..."
scp $SSH_OPTS ${SSH_USER}@${SERVER_IP}:/etc/wireguard/client.conf "${SCRIPT_DIR}/../wireguard-client.conf" 2>/dev/null || \
scp $SSH_OPTS ${SSH_USER}@${SERVER_IP}:/root/phantom-client.conf "${SCRIPT_DIR}/../wireguard-client.conf" 2>/dev/null || {
  echo "WARN: Could not download config automatically."
  echo "Copy it manually from the output above."
}

echo ""
echo "Done! Client config saved to: ${SCRIPT_DIR}/../wireguard-client.conf"
echo ""
echo "Next steps:"
echo "  1. Install WireGuard: https://wireguard.com/install"
echo "  2. Import wireguard-client.conf into WireGuard"
echo "  3. Or run: npm run electron:dev (for GUI)"
