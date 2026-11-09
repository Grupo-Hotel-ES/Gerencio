import { useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { Campo } from './formularios';
import { Botao, Cartao, Chip, Texto } from './ui';
import { Espacamento } from '@/constants/tokens';
import { descreverCliente, type Cliente } from '@/data/clientes';
import { formatarReais } from '@/data/pedidos';
import { useCores } from '@/hooks/use-cores';
import { buscarClientesSemelhantes } from '@/services/api-clientes';
import { cotarFrete, criarPedido, type CotacaoFrete, type NovoPedido } from '@/services/api-pedidos';
import { listarProdutos, type Produto } from '@/services/api-produtos';

type CampoCliente = 'nome' | 'endereco';

/** Aviso de cliente já cadastrado com o nome ou o endereço digitado. */
type Sugestao = { campo: CampoCliente; clientes: Cliente[] };

const mesmoTexto = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function FormularioPedido({ onConcluir, onFechar }: { onConcluir: () => void; onFechar: () => void }) {
  const cores = useCores();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [quantidades, setQuantidades] = useState<Record<number, number>>({});
  // Cliente: escolhido no aviso (clienteId) ou cadastrado junto com o pedido
  const [nomeCliente, setNomeCliente] = useState('');
  const [enderecoCliente, setEnderecoCliente] = useState('');
  const [telefone, setTelefone] = useState('');
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [sugestao, setSugestao] = useState<Sugestao | null>(null);
  // Clientes que a pessoa já disse que não são o deste pedido: o aviso não volta para eles
  const recusados = useRef(new Set<number>());
  const [canal, setCanal] = useState<NovoPedido['app']>('balcao');
  const [pagamento, setPagamento] = useState('dinheiro');
  const [retirada, setRetirada] = useState(true);
  const [cep, setCep] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  // A cotação vale para o endereço e o CEP em que foi feita (chave)
  const [frete, setFrete] = useState<{ chave: string; cotacao: CotacaoFrete } | null>(null);
  const [cotando, setCotando] = useState(false);
  const [erroFrete, setErroFrete] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const enviando = useRef(false);

  useEffect(() => {
    let ativo = true;
    listarProdutos().then((dados) => { if (ativo) setProdutos(dados); })
      .catch((e: Error) => { if (ativo) setErro(e.message); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, []);

  const itens = produtos.filter((p) => quantidades[p.id] > 0).map((p) => ({ produtoId: p.id, quantidade: quantidades[p.id] }));
  const subtotal = produtos.reduce((soma, p) => soma + p.preco * (quantidades[p.id] ?? 0), 0);
  const endereco = enderecoCliente;
  const chaveFrete = `${endereco.trim()}|${cep.trim()}`;
  const cotacao = !retirada && frete?.chave === chaveFrete ? frete.cotacao : null;
  const taxaEntrega = cotacao?.taxaEntrega ?? 0;
  const total = subtotal + taxaEntrega;

  // Ao sair do campo de nome ou de endereço, procura um cliente com o mesmo valor
  const verificarCliente = async (campo: CampoCliente) => {
    const valor = campo === 'nome' ? nomeCliente : enderecoCliente;
    if (clienteId !== null || !valor.trim()) return;
    try {
      const encontrados = await buscarClientesSemelhantes(campo === 'nome' ? { nome: valor } : { endereco: valor });
      const novos = encontrados.filter((c) => !recusados.current.has(c.id)).slice(0, 3);
      if (novos.length > 0) setSugestao((atual) => atual ?? { campo, clientes: novos });
    } catch {
      // Sem a api-clientes, o pedido segue e o cliente é cadastrado junto
    }
  };

  const preencherCliente = (cliente: Cliente) => {
    setNomeCliente(cliente.nome);
    setEnderecoCliente(cliente.endereco);
    setTelefone(cliente.telefone ?? '');
    setClienteId(cliente.id);
    setSugestao(null);
  };

  const recusarSugestao = () => {
    sugestao?.clientes.forEach((c) => recusados.current.add(c.id));
    setSugestao(null);
  };

  // Mudar o nome ou o endereço desfaz a escolha do cadastro existente
  const editarCliente = (campo: CampoCliente, valor: string) => {
    if (campo === 'nome') setNomeCliente(valor); else setEnderecoCliente(valor);
    setClienteId(null);
  };

  const calcularFrete = async () => {
    if (!endereco.trim() || !cep.trim()) { setErroFrete('Informe o endereço e o CEP.'); return; }
    setCotando(true); setErroFrete(null);
    try {
      const resultado = await cotarFrete(endereco.trim(), cep.trim());
      setFrete({ chave: chaveFrete, cotacao: resultado });
      if (resultado.taxaEntrega === null) setErroFrete(resultado.motivoRecusa ?? 'Endereço fora da área de entrega.');
    } catch (e) { setFrete(null); setErroFrete((e as Error).message); }
    finally { setCotando(false); }
  };

  const salvar = async () => {
    if (enviando.current) return;
    if (!nomeCliente.trim() || !enderecoCliente.trim() || itens.length === 0 || (!retirada && !cep.trim())) {
      setErro('Informe nome e endereço do cliente, produtos e o CEP para entrega.'); return;
    }
    if (cotacao && cotacao.taxaEntrega === null) {
      setErro(cotacao.motivoRecusa ?? 'Endereço fora da área de entrega.'); return;
    }
    enviando.current = true; setSalvando(true); setErro(null);
    try {
      await criarPedido({
        ...(clienteId !== null
          ? { clienteId }
          : { cliente: { nome: nomeCliente.trim(), endereco: enderecoCliente.trim(), telefone: telefone.trim() } }),
        app: canal, metodoPagamento: pagamento,
        enderecoDestino: retirada ? 'Retirada no balcão' : endereco.trim(), cepDestino: retirada ? '' : cep.trim(), itens,
        // Sem cotação na tela, a api-pedidos calcula o frete ao criar a entrega
        ...(cotacao?.taxaEntrega != null && {
          custoEntrega: cotacao.taxaEntrega, distanciaKm: cotacao.distanciaKm,
          latitude: cotacao.destino.latitude, longitude: cotacao.destino.longitude,
        }) });
      onConcluir();
    } catch (e) { setErro((e as Error).message); }
    finally { enviando.current = false; setSalvando(false); }
  };

  return (
    <Cartao style={styles.formulario}>
      <Modal visible={sugestao !== null} transparent animationType="fade" onRequestClose={recusarSugestao}>
        <View style={styles.fundoModal}>
          <View style={[StyleSheet.absoluteFill, styles.veu, { backgroundColor: cores.textoPrincipal }]} />
          <Cartao style={styles.modal} accessibilityRole="alert">
            <Texto tamanho={18} peso={600}>Cliente já cadastrado</Texto>
            {sugestao?.clientes.map((c) => {
              const mesmoNome = mesmoTexto(c.nome, nomeCliente);
              const mesmoEndereco = mesmoTexto(c.endereco, enderecoCliente);
              const motivo = mesmoNome && mesmoEndereco ? 'nome e endereço' : mesmoNome ? 'nome' : 'endereço';
              return (
                <View key={c.id} style={styles.sugestao}>
                  <Texto>Já há um cliente com esse {motivo} ({descreverCliente(c)}). Preencher?</Texto>
                  <Botao rotulo="Preencher" variante="primario" onPress={() => preencherCliente(c)} />
                </View>
              );
            })}
            <Botao rotulo="Não, é outro cliente" onPress={recusarSugestao} />
          </Cartao>
        </View>
      </Modal>
      <Texto tamanho={20} peso={600}>Novo pedido manual</Texto>
      <Texto peso={500}>Cliente</Texto>
      <Campo rotulo="Nome do cliente" value={nomeCliente} onChangeText={(v) => editarCliente('nome', v)}
        onBlur={() => verificarCliente('nome')} editable={!salvando} />
      <Campo rotulo="Endereço do cliente" value={enderecoCliente} onChangeText={(v) => editarCliente('endereco', v)}
        onBlur={() => verificarCliente('endereco')} editable={!salvando} />
      <Campo rotulo="Telefone (opcional)" value={telefone} onChangeText={setTelefone} keyboardType="phone-pad" editable={!salvando} />
      <Texto cor="textoSecundario">
        {clienteId !== null ? 'Cliente já cadastrado.' : 'Se o cliente não estiver cadastrado, ele é cadastrado junto com o pedido.'}
      </Texto>
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
      {!retirada && <><Texto cor="textoSecundario">A entrega vai para o endereço do cliente.</Texto>
        <Campo rotulo="CEP" value={cep} onChangeText={setCep} editable={!salvando} />
        <View style={styles.linha}>
          <Botao rotulo={cotando ? 'Calculando…' : 'Calcular frete'} icone="motoboy" disabled={salvando || cotando} onPress={calcularFrete} />
          {cotacao?.taxaEntrega != null && (
            <Texto cor="textoSecundario">
              Entrega: {formatarReais(cotacao.taxaEntrega)} • {cotacao.distanciaKm.toLocaleString('pt-BR')} km • cerca de {cotacao.duracaoEstimadaMinutos} min
            </Texto>
          )}
        </View>
        {erroFrete && <Texto cor="feedbackErro" accessibilityRole="alert">{erroFrete}</Texto>}
        {!cotacao && !erroFrete && <Texto cor="textoSecundario">O frete também é calculado ao criar o pedido.</Texto>}</>}
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
      {cotacao?.taxaEntrega != null && (
        <Texto cor="textoSecundario">Subtotal {formatarReais(subtotal)} + entrega {formatarReais(taxaEntrega)}</Texto>
      )}
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
  fundoModal: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Espacamento.large },
  veu: { opacity: 0.4 },
  modal: { width: '100%', maxWidth: 480, gap: Espacamento.medium },
  sugestao: { gap: Espacamento.small, alignItems: 'flex-start' },
});
