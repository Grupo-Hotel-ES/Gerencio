#!/bin/sh
# Sobe o servidor do Ollama e garante que o modelo de OLLAMA_MODEL esteja
# baixado. O download fica no volume, então só demora na primeira vez.
set -e

ollama serve &
pid=$!

until ollama list >/dev/null 2>&1; do
  sleep 1
done

# Sem internet o pull falha, mas o servidor continua com os modelos já baixados.
ollama pull "$OLLAMA_MODEL" || echo "Aviso: não foi possível baixar $OLLAMA_MODEL"

wait $pid
