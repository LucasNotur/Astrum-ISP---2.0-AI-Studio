#!/usr/bin/env bash
# infra/vps/bootstrap.sh
# Provisionamento inicial da VPS (Contabo, Ubuntu 24.04). Roda como root, via SSH.
# Idempotente: seguro rodar de novo — cada passo checa antes de criar/alterar.
# Uso: sudo bash infra/vps/bootstrap.sh

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "ERRO: rode como root (sudo bash infra/vps/bootstrap.sh)" >&2
  exit 1
fi

# ── Config (ajuste se necessário) ──
SSH_USER="${SSH_USER:-astrum}"
SSHD_CONFIG="/etc/ssh/sshd_config"

echo "==> Provisionando VPS para o usuário '$SSH_USER'..."

# ── 1. Usuário com sudo + chaves SSH ──
if ! id -u "$SSH_USER" >/dev/null 2>&1; then
  echo "==> Criando usuário $SSH_USER..."
  useradd -m -s /bin/bash "$SSH_USER"
else
  echo "==> Usuário $SSH_USER já existe, pulando criação."
fi
usermod -aG sudo "$SSH_USER"

# Copia a chave do root para o novo usuário (se existir). `install` sobrescreve
# com o mesmo conteúdo — idempotente.
if [ -f /root/.ssh/authorized_keys ]; then
  echo "==> Copiando authorized_keys para /home/$SSH_USER/.ssh/..."
  install -d -m 700 -o "$SSH_USER" -g "$SSH_USER" "/home/$SSH_USER/.ssh"
  install -m 600 -o "$SSH_USER" -g "$SSH_USER" \
    /root/.ssh/authorized_keys "/home/$SSH_USER/.ssh/authorized_keys"
else
  echo "==> /root/.ssh/authorized_keys não existe — copie sua chave manualmente depois."
fi

# ── 2. Hardening do SSH (só estas 2 diretivas, sem duplicar linha) ──
# Substitui a diretiva se já existir (comentada ou não); senão, acrescenta no fim.
set_sshd() {
  local key="$1" value="$2"
  if grep -qE "^[[:space:]]*#?[[:space:]]*${key}[[:space:]]" "$SSHD_CONFIG"; then
    sed -i -E "s|^[[:space:]]*#?[[:space:]]*${key}[[:space:]].*|${key} ${value}|" "$SSHD_CONFIG"
  else
    echo "${key} ${value}" >> "$SSHD_CONFIG"
  fi
}

# GUARD DE LOCKOUT: só desliga PasswordAuthentication/PermitRootLogin se o novo
# usuário já tem uma chave funcional instalada. Sem isso, um root sem
# authorized_keys (comum: Contabo manda senha por e-mail, não chave) ficaria
# sem NENHUM jeito de entrar via SSH depois deste script — só resgate via console.
if [ -s "/home/$SSH_USER/.ssh/authorized_keys" ]; then
  SSHD_CHANGED=0
  for directive in "PermitRootLogin:no" "PasswordAuthentication:no"; do
    key="${directive%%:*}"
    value="${directive##*:}"
    # Valor atual (ignora linhas comentadas e espaços); vazio = diretiva não existe
    current="$(sed -nE "s|^[[:space:]]*#?[[:space:]]*${key}[[:space:]]+(.*)$|\1|p" "$SSHD_CONFIG" | head -n1)"
    if [ "$current" != "$value" ]; then
      set_sshd "$key" "$value"
      SSHD_CHANGED=1
      echo "==> sshd: $key = $value"
    fi
  done

  if [ "$SSHD_CHANGED" -eq 1 ]; then
    # Valida antes de reiniciar: se o arquivo quebrou, não derruba o SSH da sessão atual
    sshd -t
    echo "==> Reiniciando sshd..."
    systemctl restart sshd
  else
    echo "==> sshd já configurado, nada a alterar."
  fi
else
  echo "==> AVISO: /home/$SSH_USER/.ssh/authorized_keys ausente ou vazia."
  echo "    PULANDO o hardening do SSH (PermitRootLogin/PasswordAuthentication) de"
  echo "    propósito — desligar login por senha agora, sem chave confirmada pro"
  echo "    $SSH_USER, te trancaria pra fora da VPS sem jeito de voltar por SSH."
  echo "    Adicione sua chave publica a /home/$SSH_USER/.ssh/authorized_keys e"
  echo "    rode este script de novo para aplicar o hardening."
fi

# ── 3. Firewall ufw ──
command -v ufw >/dev/null 2>&1 || apt-get install -y ufw
echo "==> Configurando ufw (deny incoming, allow outgoing, OpenSSH liberado)..."
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH >/dev/null   # ufw ignora regra duplicada
ufw --force enable             # --force: habilita sem prompt interativo

# ── 4. Docker ──
if command -v docker >/dev/null 2>&1; then
  echo "==> Docker já instalado ($(docker --version)), pulando."
else
  echo "==> Instalando Docker via get.docker.com..."
  curl -fsSL https://get.docker.com | sh
fi
usermod -aG docker "$SSH_USER"

# ── 5. cloudflared ──
if command -v cloudflared >/dev/null 2>&1; then
  echo "==> cloudflared já instalado ($(cloudflared --version)), pulando."
else
  echo "==> Instalando cloudflared (última release do GitHub)..."
  case "$(uname -m)" in
    x86_64)  DEB_ARCH="amd64" ;;
    aarch64) DEB_ARCH="arm64" ;;
    *) echo "ERRO: arquitetura não suportada: $(uname -m)" >&2; exit 1 ;;
  esac
  LATEST_TAG="$(curl -fsSL https://api.github.com/repos/cloudflare/cloudflared/releases/latest \
    | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n1)"
  if [ -z "$LATEST_TAG" ]; then
    echo "ERRO: não consegui descobrir a última release do cloudflared." >&2
    exit 1
  fi
  curl -fsSL -o /tmp/cloudflared.deb \
    "https://github.com/cloudflare/cloudflared/releases/download/${LATEST_TAG}/cloudflared-linux-${DEB_ARCH}.deb"
  dpkg -i /tmp/cloudflared.deb
  rm -f /tmp/cloudflared.deb
fi
# NÃO roda `cloudflared service install` aqui: as credenciais do tunnel
# (cert.pem/tunnel.json) são copiadas manualmente DEPOIS. Ver próximos passos.

# ── 6. Resumo e próximos passos ──
echo ""
echo "=============================================="
echo " Provisionamento concluído"
echo "=============================================="
echo "[OK] Usuário $SSH_USER criado (sudo) e authorized_keys copiada"
echo "[OK] SSH endurecido: PermitRootLogin no, PasswordAuthentication no"
echo "[OK] ufw ativo: deny incoming, allow outgoing, OpenSSH liberado"
echo "[OK] Docker instalado; $SSH_USER no grupo docker"
echo "[OK] cloudflared instalado (serviço ainda NÃO registrado)"
echo ""
echo "PRÓXIMOS PASSOS (manuais):"
echo "1. Reabra o SSH como $SSH_USER (mesma chave do root) — o grupo docker"
echo "   só vale em sessão nova."
echo "2. Clone o repo: git clone <URL_DO_REPO> ~/astrum"
echo "3. Copie o .env de produção para a raiz do repo (gitignorado)."
echo "   Gere segredos com: bash scripts/generate-secrets.sh"
echo "4. Copie as credenciais do tunnel para ~/.cloudflared/ (cert.pem + tunnel.json)"
echo "   e só então rode: sudo cloudflared service install"
echo "5. Deploy (de dentro do repo clonado): bash infra/vps/deploy.sh"
