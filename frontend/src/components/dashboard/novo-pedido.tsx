import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Campo, SeletorRestaurante } from './formularios';
import { Botao, Cartao, Chip, Texto } from './ui';
import { Espacamento } from '@/constants/tokens';
import { formatarReais } from '@/data/pedidos';
import { criarPedido, type NovoPedido } from '@/services/api-pedidos';
import { listarProdutos, type Produto, type Restaurante } from '@/services/api-produtos';

export function FormularioPedido({ restaurantes, restauranteInicial, onConcluir, onFechar }: {
  restaurantes: Restaurante[]; restauranteInicial?: number; onConcluir: (restauranteId: number) => void; onFechar: () => void;
}) {
  const [restauranteId, setRestauranteId] = useState<number | undefined>(restauranteInicial ?? restaurantes[0]?.id);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [quantidades, setQuantidades] = useState<Record<number, number>>({});
  const [nomeCliente, setNomeCliente] = useState('');
  const [canal, setCanal] = useState<NovoPedido['app']>('balcao');
  const [pagamento, setPagamento] = useState('dinheiro');
  const [retirada, setRetirada] = useState(true);
  const [endereco, setEndereco] = useState('');
  const [cep, setCep] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const enviando = useRef(false);

  useEffect(() => {
    let ativo = true;
    if (!restauranteId) return;
    listarProdutos(restauranteId).then((dados) => { if (ativo) setProdutos(dados); })
      .catch((e: Error) => { if (ativo) setErro(e.message); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [restauranteId]);

  const itens = produtos.filter((p) => quantidades[p.id] > 0).map((p) => ({ produtoId: p.id, quantidade: quantidades[p.id] }));
  const total = produtos.reduce((soma, p) => soma + p.preco * (quantidades[p.id] ?? 0), 0);
  const salvar = async () => {
    if (enviando.current) return;
    if (!restauranteId || !nomeCliente.trim() || itens.length === 0 || (!retirada && (!endereco.trim() || !cep.trim()))) {
      setErro('Informe restaurante, cliente, produtos e o endereço com CEP para entrega.'); return;
    }
    enviando.current = true; setSalvando(true); setErro(null);
    try {
      await criarPedido({ restauranteId, nomeCliente: nomeCliente.trim(), app: canal, metodoPagamento: pagamento,
        enderecoDestino: retirada ? 'Retirada no balcão' : endereco.trim(), cepDestino: retirada ? '' : cep.trim(), itens });
      onConcluir(restauranteId);
    } catch (e) { setErro((e as Error).message); }
    finally { enviando.current = false; setSalvando(false); }
  };

  return (
    <Cartao style={styles.formulario}>
      <Texto tamanho={20} peso={600}>Novo pedido manual</Texto>
      <SeletorRestaurante restaurantes={restaurantes} valor={restauranteId} onChange={(id) => {
        setProdutos([]); setQuantidades({}); setErro(null); setCarregando(true); setRestauranteId(id);
      }} desabilitado={salvando} />
      <Campo rotulo="Nome do cliente" value={nomeCliente} onChangeText={setNomeCliente} editable={!salvando} />
      <View style={styles.linha}>
        {(['balcao', 'whatsapp'] as const).map((c) => <Chip key={c} rotulo={c === 'balcao' ? 'Balcão' : 'WhatsApp'} ativo={canal === c} onPress={salvando ? undefined : () => setCanal(c)} />)}
      </View>
      <Texto peso={500}>Forma de pagamento</Texto>
      <View style={styles.linha}>
        {['dinheiro', 'pix', 'cartao'].map((p) => <Chip key={p} rotulo={{ dinheiro: 'Dinheiro', pix: 'Pix', cartao: 'Cartão' }[p] ?? p} ativo={pagamento === p} onPress={salvando ? undefined : () => setPagamento(p)} />)}
      </View>
      <View style={styles.linha}>
        <Chip rotulo="Retirada" ativo={retirada} onPress={salvando ? undefined : () => setRetirada(true)} />
        <Chip rotulo="Entrega" ativo={!retirada} onPress={salvando ? undefined : () => setRetirada(false)} />
      </View>
      {!retirada && <><Campo rotulo="Endereço de entrega" value={endereco} onChangeText={setEndereco} editable={!salvando} />
        <Campo rotulo="CEP" value={cep} onChangeText={setCep} editable={!salvando} /></>}
      <Texto peso={500}>Produtos</Texto>
      {carregando && <Texto>Carregando produtos…</Texto>}
      {!carregando && produtos.length === 0 && <Texto>Cadastre os produtos na tela de estoque.</Texto>}
      {produtos.map((p) => <View key={p.id} style={styles.linha}>
        <View style={styles.nome}><Texto peso={500}>{p.nome} • {formatarReais(p.preco)}</Texto><Texto cor="textoSecundario">Saldo: {p.quantidade} un.</Texto></View>
        <Botao rotulo="−" accessibilityLabel={`Remover uma unidade de ${p.nome}`} disabled={salvando || !quantidades[p.id]}
          onPress={() => setQuantidades((atual) => ({ ...atual, [p.id]: Math.max(0, (atual[p.id] ?? 0) - 1) }))} />
        <Texto>{quantidades[p.id] ?? 0}</Texto>
        <Botao rotulo="+" accessibilityLabel={`Adicionar uma unidade de ${p.nome}`} disabled={salvando || (quantidades[p.id] ?? 0) >= p.quantidade}
          onPress={() => setQuantidades((atual) => ({ ...atual, [p.id]: (atual[p.id] ?? 0) + 1 }))} />
      </View>)}
      <Texto tamanho={20} peso={600}>Total: {formatarReais(total)}</Texto>
      <Texto cor="textoSecundario">O pedido entra como novo. As unidades são reservadas ao aceitar na fila.</Texto>
      {erro && <Texto cor="feedbackErro" accessibilityRole="alert">{erro}</Texto>}
      <View style={styles.linha}>
        <Botao rotulo={salvando ? 'Criando…' : 'Criar pedido'} variante="primario" disabled={salvando || carregando || itens.length === 0} onPress={salvar} />
        <Botao rotulo="Fechar" disabled={salvando} onPress={onFechar} />
      </View>
    </Cartao>
  );
}

const styles = StyleSheet.create({
  formulario: { gap: Espacamento.large },
  linha: { flexDirection: 'row', flexWrap: 'wrap', gap: Espacamento.small, alignItems: 'center' },
  nome: { flex: 1, minWidth: 160 },
});
