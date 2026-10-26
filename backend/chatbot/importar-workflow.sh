#!/bin/sh
# Importa no n8n (container geroncio-chatbot) as credenciais e os workflows do
# chatbot e publica o de atendimento. Rode de dentro de backend/ com o compose
# de pé: sh chatbot/importar-workflow.sh
set -e
cd "$(dirname "$0")/.."

env_ou() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- || true; }
CHAVE_EVOLUTION=$(env_ou AUTHENTICATION_API_KEY)
PG_USER=$(env_ou POSTGRES_USER); PG_USER=${PG_USER:-geroncio}
PG_SENHA=$(env_ou POSTGRES_PASSWORD); PG_SENHA=${PG_SENHA:-geroncio_dev}
PG_DB=$(env_ou POSTGRES_DB); PG_DB=${PG_DB:-geroncio}

if [ -z "$CHAVE_EVOLUTION" ]; then
  echo "Defina AUTHENTICATION_API_KEY no backend/.env" >&2
  exit 1
fi

# As credenciais vão em texto puro para o container e o n8n as criptografa no import
credenciais=$(mktemp)
trap 'rm -f "$credenciais"' EXIT
cat > "$credenciais" <<JSON
[
  {
    "id": "geroncioPostgres",
    "name": "Postgres Gerôncio",
    "type": "postgres",
    "data": { "host": "postgres", "port": 5432, "database": "$PG_DB", "user": "$PG_USER", "password": "$PG_SENHA", "ssl": "disable" }
  },
  {
    "id": "geroncioEvoApi01",
    "name": "Evolution API",
    "type": "httpHeaderAuth",
    "data": { "name": "apikey", "value": "$CHAVE_EVOLUTION" }
  }
]
JSON

docker cp "$credenciais" geroncio-chatbot:/tmp/credenciais.json
docker exec geroncio-chatbot n8n import:credentials --input=/tmp/credenciais.json
docker exec geroncio-chatbot rm -f /tmp/credenciais.json

docker cp chatbot/workflows/. geroncio-chatbot:/tmp/workflows
docker exec geroncio-chatbot n8n import:workflow --separate --input=/tmp/workflows
docker exec geroncio-chatbot rm -rf /tmp/workflows
docker exec geroncio-chatbot n8n publish:workflow --id=geroncioWhatsApp

# O n8n só registra o webhook de um workflow publicado pelo CLI depois de reiniciar
docker restart geroncio-chatbot >/dev/null
echo "Workflow publicado. Webhook: http://chatbot:5678/webhook/whatsapp (dentro do compose)"
