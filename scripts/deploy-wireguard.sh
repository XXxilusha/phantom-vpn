#!/bin/bash
# ============================================
# Phantom VPN — WireGuard Server Auto-Deploy
# ============================================
# Usage: ssh user@server 'bash -s' < deploy-wireguard.sh
# Or:    scp deploy-wireguard.sh user@server:~ && ssh user@server 'chmod +x deploy-wireguard.sh && ./deploy-wireguard.sh'
# ============================================

set -e
trap 'echo "ERROR: Script failed at line $LINENO"; exit 1' ERR

WG_PORT=${WG_PORT:-51820}
WG_DNS=${WG_DNS:-"1.1.1.1, 8.8.8.8"}
WG_MTU=${WG_MTU:-1420}
WG_SUBNET="10.66.66"
CLIENT_COUNT=${CLIENT_COUNT:-1}

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${CYAN}[$(date '+%H:%M:%S')]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║    Phantom VPN — WireGuard Setup     ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"
echo ""

# Check root
if [[ $EUID -ne 0 ]]; then
  if command -v sudo &> /dev/null; then
    SUDO="sudo"
  else
    error "This script must be run as root or with sudo"
  fi
else
  SUDO=""
fi

# Detect OS
if [[ -f /etc/os-release ]]; then
  . /etc/os-release
  OS=$ID
else
  error "Unsupported operating system"
fi

log "Detected OS: $OS"

# ---- STEP 1: Update & Install ----
log "Updating system packages..."
case $OS in
  ubuntu|debian)
    $SUDO apt-get update -y -qq
    $SUDO apt-get install -y -qq wireguard wireguard-tools qrencode iptables curl
    ;;
  centos|rhel|rocky|alma)
    $SUDO yum install -y epel-release
    $SUDO yum install -y wireguard-tools qrencode iptables curl
    ;;
  fedora)
    $SUDO dnf install -y wireguard-tools qrencode iptables curl
    ;;
  *)
    warn "Unknown OS, attempting Ubuntu-style install..."
    $SUDO apt-get update -y && $SUDO apt-get install -y wireguard wireguard-tools qrencode iptables curl
    ;;
esac
success "WireGuard installed"

# ---- STEP 2: Generate Keys ----
log "Generating cryptographic keys..."
SERVER_PRIV=$(wg genkey)
SERVER_PUB=$(echo "$SERVER_PRIV" | wg pubkey)

CLIENT_PRIV=$(wg genkey)
CLIENT_PUB=$(echo "$CLIENT_PRIV" | wg pubkey)
PSK=$(wg genpsk)

success "Keys generated"

# ---- STEP 3: Detect Network ----
SERVER_IP=$(curl -s -4 ifconfig.me || curl -s icanhazip.com || curl -s ipecho.net/plain)
DEFAULT_IFACE=$(ip -4 route show default | awk '{print $5}' | head -1)

if [[ -z "$SERVER_IP" ]]; then
  error "Could not detect server public IP"
fi
if [[ -z "$DEFAULT_IFACE" ]]; then
  error "Could not detect default network interface"
fi

log "Public IP: $SERVER_IP"
log "Interface: $DEFAULT_IFACE"

# ---- STEP 4: Server Config ----
log "Writing server configuration..."
$SUDO mkdir -p /etc/wireguard

$SUDO tee /etc/wireguard/wg0.conf > /dev/null <<EOF
[Interface]
Address = ${WG_SUBNET}.1/24
ListenPort = $WG_PORT
PrivateKey = $SERVER_PRIV
MTU = $WG_MTU

PostUp = iptables -I INPUT -p udp --dport $WG_PORT -j ACCEPT
PostUp = iptables -I FORWARD -i wg0 -j ACCEPT
PostUp = iptables -I FORWARD -o wg0 -j ACCEPT
PostUp = iptables -t nat -A POSTROUTING -o $DEFAULT_IFACE -j MASQUERADE

PostDown = iptables -D INPUT -p udp --dport $WG_PORT -j ACCEPT
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT
PostDown = iptables -D FORWARD -o wg0 -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -o $DEFAULT_IFACE -j MASQUERADE

[Peer]
PublicKey = $CLIENT_PUB
PresharedKey = $PSK
AllowedIPs = ${WG_SUBNET}.2/32
EOF

$SUDO chmod 600 /etc/wireguard/wg0.conf
success "Server config written"

# ---- STEP 5: Client Config ----
log "Generating client configuration..."

CLIENT_CONF="[Interface]
PrivateKey = $CLIENT_PRIV
Address = ${WG_SUBNET}.2/24
DNS = $WG_DNS
MTU = $WG_MTU

[Peer]
PublicKey = $SERVER_PUB
PresharedKey = $PSK
Endpoint = ${SERVER_IP}:${WG_PORT}
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25"

echo "$CLIENT_CONF" | $SUDO tee /etc/wireguard/client.conf > /dev/null
echo "$CLIENT_CONF" | $SUDO tee /root/phantom-client.conf > /dev/null

success "Client config saved to /etc/wireguard/client.conf"

# ---- STEP 6: Enable IP Forwarding ----
log "Enabling IP forwarding..."
$SUDO sysctl -w net.ipv4.ip_forward=1 > /dev/null
if ! grep -q "^net.ipv4.ip_forward=1" /etc/sysctl.conf; then
  echo "net.ipv4.ip_forward=1" | $SUDO tee -a /etc/sysctl.conf > /dev/null
fi
$SUDO sysctl -p > /dev/null 2>&1
success "IP forwarding enabled"

# ---- STEP 7: Open Firewall ----
log "Configuring firewall..."
if command -v ufw &> /dev/null; then
  $SUDO ufw allow $WG_PORT/udp > /dev/null 2>&1 || true
  $SUDO ufw allow OpenSSH > /dev/null 2>&1 || true
  $SUDO ufw --force enable > /dev/null 2>&1 || true
fi

# Oracle Cloud specific: open iptables
$SUDO iptables -I INPUT -p udp --dport $WG_PORT -j ACCEPT 2>/dev/null || true
success "Firewall configured"

# ---- STEP 8: Start WireGuard ----
log "Starting WireGuard..."
$SUDO systemctl enable wg-quick@wg0 2>/dev/null || true
$SUDO systemctl restart wg-quick@wg0

if $SUDO wg show wg0 &>/dev/null; then
  success "WireGuard is running!"
else
  error "WireGuard failed to start. Check: systemctl status wg-quick@wg0"
fi

# ---- DONE ----
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     DEPLOYMENT SUCCESSFUL!               ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "Server IP:     ${CYAN}$SERVER_IP${NC}"
echo -e "WireGuard Port:${CYAN} $WG_PORT${NC}"
echo -e "Server PubKey: ${CYAN}$SERVER_PUB${NC}"
echo ""
echo -e "${YELLOW}--- CLIENT CONFIG (save as phantom.conf) ---${NC}"
echo "$CLIENT_CONF"
echo -e "${YELLOW}--- END ---${NC}"
echo ""

if command -v qrencode &> /dev/null; then
  echo -e "${CYAN}QR Code (scan with WireGuard mobile app):${NC}"
  echo "$CLIENT_CONF" | qrencode -t ansiutf8
fi

echo ""
echo -e "To connect from your PC:"
echo -e "  1. Install WireGuard: ${CYAN}https://wireguard.com/install${NC}"
echo -e "  2. Import the config above or /etc/wireguard/client.conf"
echo -e "  3. Activate the tunnel"
echo ""
