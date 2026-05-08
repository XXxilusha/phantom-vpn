#!/bin/bash
# ============================================
# Phantom VPN — Xray VLESS + Reality Setup
# ============================================
# For bypassing deep packet inspection (DPI)
# Usage: ssh user@server 'bash -s' < deploy-xray-vless.sh
# ============================================

set -e
trap 'echo "ERROR at line $LINENO"; exit 1' ERR

XRAY_PORT=${XRAY_PORT:-443}
DEST_SERVER="www.microsoft.com"
DEST_PORT="443"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
NC='\033[0m'

log() { echo -e "${CYAN}[$(date '+%H:%M:%S')]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }

echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  Phantom VPN — VLESS + Reality       ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"

SUDO=""
[[ $EUID -ne 0 ]] && SUDO="sudo"

# Install Xray
log "Installing Xray-core..."
$SUDO bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install
success "Xray installed"

# Generate keys
log "Generating Reality keypair..."
KEYS=$($SUDO xray x25519)
PRIVATE_KEY=$(echo "$KEYS" | grep "Private" | awk '{print $3}')
PUBLIC_KEY=$(echo "$KEYS" | grep "Public" | awk '{print $3}')
UUID=$($SUDO xray uuid)
SHORT_ID=$(openssl rand -hex 8)
SERVER_IP=$(curl -s -4 ifconfig.me)

success "Keys generated"
log "UUID: $UUID"

# Write server config
log "Writing Xray server config..."
$SUDO mkdir -p /usr/local/etc/xray

$SUDO tee /usr/local/etc/xray/config.json > /dev/null <<XEOF
{
  "log": { "loglevel": "warning" },
  "inbounds": [{
    "listen": "0.0.0.0",
    "port": $XRAY_PORT,
    "protocol": "vless",
    "settings": {
      "clients": [{
        "id": "$UUID",
        "flow": "xtls-rprx-vision"
      }],
      "decryption": "none"
    },
    "streamSettings": {
      "network": "tcp",
      "security": "reality",
      "realitySettings": {
        "show": false,
        "dest": "$DEST_SERVER:$DEST_PORT",
        "xver": 0,
        "serverNames": ["$DEST_SERVER"],
        "privateKey": "$PRIVATE_KEY",
        "shortIds": ["$SHORT_ID"]
      }
    },
    "sniffing": {
      "enabled": true,
      "destOverride": ["http", "tls", "quic"]
    }
  }],
  "outbounds": [{
    "protocol": "freedom",
    "tag": "direct"
  }]
}
XEOF

success "Server config written"

# Open port
log "Opening port $XRAY_PORT..."
if command -v ufw &> /dev/null; then
  $SUDO ufw allow $XRAY_PORT/tcp > /dev/null 2>&1 || true
fi
$SUDO iptables -I INPUT -p tcp --dport $XRAY_PORT -j ACCEPT 2>/dev/null || true

# Start Xray
log "Starting Xray service..."
$SUDO systemctl enable xray
$SUDO systemctl restart xray
success "Xray is running"

# Client config
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     VLESS + REALITY READY!               ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo "=== Client Connection Details ==="
echo "Protocol:   VLESS"
echo "Address:    $SERVER_IP"
echo "Port:       $XRAY_PORT"
echo "UUID:       $UUID"
echo "Flow:       xtls-rprx-vision"
echo "Security:   Reality"
echo "SNI:        $DEST_SERVER"
echo "Public Key: $PUBLIC_KEY"
echo "Short ID:   $SHORT_ID"
echo ""
echo "=== VLESS Share Link ==="
echo "vless://${UUID}@${SERVER_IP}:${XRAY_PORT}?encryption=none&flow=xtls-rprx-vision&security=reality&sni=${DEST_SERVER}&fp=chrome&pbk=${PUBLIC_KEY}&sid=${SHORT_ID}&type=tcp#Phantom-VLESS"
echo ""
echo "Import this link into: v2rayN, v2rayNG, Nekoray, Hiddify"
