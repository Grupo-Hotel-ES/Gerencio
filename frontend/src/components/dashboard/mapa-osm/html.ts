import type { RotaCalculada } from '@/data/rotas';

export type CoresMapa = {
  rota: string;
  selo: string;
  textoSelo: string;
  partida: string;
  textoPartida: string;
};

/**
 * Página com o mapa do OpenStreetMap (Leaflet): traçado da rota, restaurante e paradas numeradas.
 * A mesma página roda num iframe (web) e numa WebView (app).
 */
export function htmlDoMapa(rota: RotaCalculada, cores: CoresMapa) {
  // "<" escapado para os dados não fecharem a tag <script> antes da hora
  const dados = JSON.stringify({ rota, cores }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html, body, #mapa { height: 100%; margin: 0; }
  .marcador { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px;
    border-radius: 8px; font: 600 14px system-ui, sans-serif; box-shadow: 0 1px 4px rgba(0, 0, 0, .35); }
</style>
</head>
<body>
<div id="mapa"></div>
<script>
  const { rota, cores } = ${dados};
  const mapa = L.map('mapa', { zoomControl: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(mapa);

  const marcador = (texto, fundo, cor) => L.divIcon({
    className: '',
    html: '<div class="marcador" style="background:' + fundo + ';color:' + cor + '">' + texto + '</div>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

  const linha = L.polyline(rota.geometria, { color: cores.rota, weight: 5, opacity: 0.85 }).addTo(mapa);
  L.marker([rota.origem.latitude, rota.origem.longitude], { icon: marcador('R', cores.partida, cores.textoPartida) })
    .bindTooltip(rota.origem.nome).addTo(mapa);
  rota.paradas.forEach((parada, i) => {
    L.marker([parada.latitude, parada.longitude], { icon: marcador(String(i + 1), cores.selo, cores.textoSelo) })
      .bindTooltip('#' + parada.pedidoId + ' • ' + (parada.cliente || '') + '<br>' + parada.endereco).addTo(mapa);
  });
  mapa.fitBounds(linha.getBounds(), { padding: [32, 32] });
</script>
</body>
</html>`;
}
