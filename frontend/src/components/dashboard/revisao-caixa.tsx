import { useEffect, useRef, useState } from 'react';
import { formatarReais } from '@/data/pedidos';
import { atualizarVerificacaoPedido, type RevisaoCaixa } from '@/services/api-pedidos';
import { listarProdutos, type Produto } from '@/services/api-produtos';
import { Botao, Cartao, Texto } from './ui';

export function RevisaoDoCaixa({ pedido, fechar, atualizar }: {
  pedido: RevisaoCaixa; fechar: () => void; atualizar: (pedido: RevisaoCaixa) => void;
}) {
  const [catalogo, setCatalogo] = useState<Produto[]>([]);
  const [quantidades, definir] = useState<Record<number, number>>(
    () => Object.fromEntries(pedido.itens.map(i => [i.produtoId, i.quantidade])),
  );
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const trava = useRef(false);
  useEffect(() => {
    let ativo = true;
    listarProdutos().then(ps => { if (ativo) setCatalogo(ps.filter(p => p.restauranteId === pedido.restauranteId)); })
      .catch(e => { if (ativo) setErro(e.message); });
    return () => { ativo = false; };
  }, [pedido.restauranteId]);
  const itens = Object.entries(quantidades).filter(([, q]) => q > 0).map(([id, quantidade]) => ({ produtoId: Number(id), quantidade }));
  const alterado = itens.length !== pedido.itens.length || pedido.itens.some(i => quantidades[i.produtoId] !== i.quantidade);
  async function enviar(acao: 'alterar' | 'confirmar' | 'cancelar') {
    if (trava.current) return;
    trava.current = true; setOcupado(true); setErro('');
    try {
      const atualizado = await atualizarVerificacaoPedido(
        pedido.id,
        acao,
        pedido.versaoVerificacao,
        itens,
      );
      if (acao === 'alterar') atualizar(atualizado);
      else fechar();
    } catch (e) { setErro((e as Error).message); }
    finally { trava.current = false; setOcupado(false); }
  }
  const nomes = new Map(pedido.itens.map(i => [i.produtoId, i.produto.nome]));
  for (const p of catalogo) nomes.set(p.id, p.nome);
  const rotuloId = pedido.id < 0 ? `OFF-${Math.abs(pedido.id)}` : String(pedido.id);
  return <Cartao>
    <Texto peso={600}>Pedido #{rotuloId} em verificação · {pedido.cliente?.nomeCliente}</Texto>
    <Texto>Estoque reservado: {pedido.itens.map(i => `${i.quantidade} × ${i.produto.nome}`).join(', ')}</Texto>
    <Texto>Total reservado: {formatarReais(Number(pedido.preco) + Number(pedido.entrega?.custoEntrega ?? 0))}</Texto>
    {[...nomes].map(([id, nome]) => <Cartao key={id}>
      <Texto>{nome} · {quantidades[id] ?? 0} un.</Texto>
      <Botao rotulo="−" disabled={ocupado || !quantidades[id]} onPress={() => definir(q => ({ ...q, [id]: Math.max(0, q[id] - 1) }))} />
      <Botao rotulo="+" disabled={ocupado} onPress={() => definir(q => ({ ...q, [id]: (q[id] ?? 0) + 1 }))} />
    </Cartao>)}
    {!!erro && <Texto accessibilityRole="alert" cor="feedbackErro">{erro}</Texto>}
    {alterado ? <Botao rotulo="Verificar alterações" disabled={ocupado || !itens.length} onPress={() => enviar('alterar')} />
      : <Botao rotulo="Confirmar pedido" disabled={ocupado} onPress={() => enviar('confirmar')} />}
    <Botao rotulo="Cancelar pedido e devolver itens" disabled={ocupado} onPress={() => enviar('cancelar')} />
    <Botao rotulo="Voltar aos abertos" disabled={ocupado} onPress={fechar} />
  </Cartao>;
}
