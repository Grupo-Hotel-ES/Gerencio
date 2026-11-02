-- AlterTable: adiciona coordenadas e regras de cálculo de frete no Restaurante
ALTER TABLE "Restaurante"
ADD COLUMN "latitude" DOUBLE PRECISION,
ADD COLUMN "longitude" DOUBLE PRECISION,
ADD COLUMN "taxa_entrega_base" DECIMAL(10,2) NOT NULL DEFAULT 6.00,
ADD COLUMN "km_inclusos_taxa_base" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
ADD COLUMN "custo_por_km_adicional" DECIMAL(10,2) NOT NULL DEFAULT 1.15,
ADD COLUMN "distancia_maxima_km" DOUBLE PRECISION;

-- AlterTable: registra a distância calculada pelas vias na Entrega
ALTER TABLE "Entrega"
ADD COLUMN "distancia_km" DOUBLE PRECISION;

