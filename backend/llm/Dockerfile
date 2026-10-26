# Versão fixa (out/2026); troque aqui para atualizar o Ollama.
ARG OLLAMA_VERSION=0.35.1
FROM ollama/ollama:${OLLAMA_VERSION}

# Padrões do Gerôncio; o docker-compose pode sobrescrever qualquer um deles.
# OLLAMA_MODEL é o modelo baixado na subida do container (ver entrypoint.sh).
ENV OLLAMA_HOST=0.0.0.0:11434 \
    OLLAMA_MODEL=qwen3.5:4b \
    OLLAMA_KEEP_ALIVE=24h

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 11434
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
