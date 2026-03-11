#!/usr/bin/env bash
set -e

REPO="Arasiia/klix"
INSTALL_DIR="/usr/local/bin"

OS=$(uname -s)
ARCH=$(uname -m)

case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64)  ARTIFACT="klix-macos-arm64" ;;
      x86_64) ARTIFACT="klix-macos-x64" ;;
      *)      echo "Architecture non supportée: $ARCH"; exit 1 ;;
    esac
    ;;
  Linux)
    case "$ARCH" in
      x86_64) ARTIFACT="klix-linux-x64" ;;
      *)      echo "Architecture non supportée: $ARCH"; exit 1 ;;
    esac
    ;;
  *)
    echo "OS non supporté: $OS"
    exit 1
    ;;
esac

echo "Détecté: $OS $ARCH → $ARTIFACT"

KLIX_VERSION=$(curl -sL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name":' | sed -E 's/.*"v([^"]+)".*/\1/')

if [ -z "$KLIX_VERSION" ]; then
  echo "Impossible de récupérer la dernière version."
  exit 1
fi

echo "Téléchargement klix v${KLIX_VERSION}..."
curl -fL "https://github.com/${REPO}/releases/download/v${KLIX_VERSION}/${ARTIFACT}" -o /tmp/klix
chmod +x /tmp/klix

echo "Installation dans ${INSTALL_DIR}/klix (sudo requis)..."
sudo mv /tmp/klix "${INSTALL_DIR}/klix"

echo "klix v${KLIX_VERSION} installé !"
klix --version
