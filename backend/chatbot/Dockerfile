# Versão fixa (tag "stable" em out/2026); troque aqui para atualizar o n8n.
ARG N8N_VERSION=2.43.7
FROM n8nio/n8n:${N8N_VERSION}

# Padrões do Gerôncio; o docker-compose pode sobrescrever qualquer um deles.
ENV GENERIC_TIMEZONE=America/Sao_Paulo \
    TZ=America/Sao_Paulo \
    N8N_PORT=5678 \
    N8N_DEFAULT_LOCALE=pt-BR \
    N8N_DIAGNOSTICS_ENABLED=false \
    N8N_PERSONALIZATION_ENABLED=false

EXPOSE 5678
