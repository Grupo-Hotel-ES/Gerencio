import React, { useCallback, useEffect, useRef, useState } from 'react';

// Portal do restaurante: simula o painel de parceiro de cada plataforma de delivery.
// O restaurante cadastra os produtos aqui; cada plataforma gera um ID para o produto,
// que é o código usado depois em "Vincular produto", no Gerêncio. Num produto vinculado,
// estoque e preço mudados aqui vão para o Gerêncio, que repassa a todas as plataformas.

const API_URL = process.env.REACT_APP_MOCK_API_URL || 'http://localhost:3333';
const INTERVALO_ATUALIZACAO_MS = 5000;

const PLATAFORMAS = [
  { id: 'ifood', nome: 'iFood' },
  { id: 'rappi', nome: 'Rappi' },
  { id: 'ubereats', nome: 'Uber Eats' },
  { id: '99food', nome: '99 Food' },
  { id: 'keeta', nome: 'Keeta' },
];

const tema = { fundoTela: '#121212', fundoCaixa: '#1e1e1e', fundoItem: '#2a2a2a', borda: '1px solid #333', corPrimaria: '#ea1d2c', sucesso: '#27ae60', erro: '#e74c3c', apagado: '#999' };
const campo = { padding: '10px', borderRadius: '5px', backgroundColor: '#333', color: '#fff', border: tema.borda, fontSize: '14px' };
const botao = { padding: '10px 14px', borderRadius: '5px', border: tema.borda, backgroundColor: '#333', color: '#fff', cursor: 'pointer', fontWeight: 'bold' };
const botaoPrimario = { ...botao, backgroundColor: tema.corPrimaria, border: 'none' };

const formatarHora = (data) => new Date(data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

async function chamarApi(caminho, opcoes) {
  const resposta = await fetch(`${API_URL}${caminho}`, { headers: { 'Content-Type': 'application/json' }, ...opcoes });
  const corpo = resposta.status === 204 ? null : await resposta.json();
  if (!resposta.ok) throw new Error(corpo?.erro || `Erro ${resposta.status}`);
  return corpo;
}

function BotaoCopiar({ texto }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = () => {
    navigator.clipboard?.writeText(texto).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    });
  };
  return <button type="button" onClick={copiar} style={{ ...botao, padding: '4px 10px', fontSize: '12px' }} aria-label={`Copiar ID ${texto}`}>{copiado ? 'Copiado!' : 'Copiar'}</button>;
}

/** Linha de um produto do cardápio, com edição de saldo e preço (sincronizada se estiver vinculado). */
function ProdutoDoCardapio({ produto, plataforma, aoAlterar }) {
  // Rascunhos: nulo enquanto o restaurante não edita, para o saldo acompanhar pedidos e sincronizações
  const [rascunhoQuantidade, setRascunhoQuantidade] = useState(null);
  const [rascunhoPreco, setRascunhoPreco] = useState(null);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [mensagem, setMensagem] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const vinculado = Boolean(produto.sincronizadoEm);
  const caminho = `/catalogo/${plataforma.id}/${encodeURIComponent(produto.idExterno)}`;
  const quantidade = rascunhoQuantidade ?? String(produto.quantidade);
  const preco = rascunhoPreco ?? (produto.precoCentavos / 100).toFixed(2).replace('.', ',');
  const alterado = rascunhoQuantidade !== null || rascunhoPreco !== null;

  const executar = async (acao) => {
    setSalvando(true); setMensagem(null);
    try { await acao(); await aoAlterar(); }
    catch (erro) { setMensagem({ erro: true, texto: erro.message }); }
    finally { setSalvando(false); }
  };

  const salvar = () => executar(async () => {
    const { gerencio } = await chamarApi(caminho, { method: 'PATCH', body: JSON.stringify({ quantidade: Number(quantidade), preco }) });
    setRascunhoQuantidade(null); setRascunhoPreco(null);
    const texto = !gerencio ? 'Alterações salvas.'
      : gerencio.restaurado ? 'O produto voltou ao estoque do Gerêncio. As outras plataformas recebem o novo estoque em instantes.'
      : gerencio.vinculado ? 'Enviado ao Gerêncio. As outras plataformas recebem a alteração em instantes.'
      : 'Alterações salvas. O Gerêncio não tem mais este produto vinculado, então ele passa a ser controlado só aqui.';
    setMensagem({ erro: false, texto });
  });

  const excluir = () => executar(() => chamarApi(caminho, { method: 'DELETE' }));

  return (
    <div style={{ backgroundColor: tema.fundoItem, borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 'bold', fontSize: '16px' }}>
            {produto.nome}
            {produto.quantidade === 0 && <span style={{ marginLeft: '8px', fontSize: '11px', color: tema.erro, border: `1px solid ${tema.erro}`, borderRadius: '4px', padding: '1px 6px', verticalAlign: 'middle' }}>Indisponível</span>}
          </div>
          <div style={{ fontSize: '12px', color: tema.apagado }}>{produto.categoria}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: tema.apagado }}>ID no {plataforma.nome}:</span>
          <code style={{ backgroundColor: '#121212', padding: '4px 8px', borderRadius: '4px', fontSize: '14px' }}>{produto.idExterno}</code>
          <BotaoCopiar texto={produto.idExterno} />
        </div>
      </div>

      {vinculado && (
        <div style={{ fontSize: '12px', color: tema.sucesso }}>
          ● Vinculado ao Gerêncio (sincronizado às {formatarHora(produto.sincronizadoEm)}). Estoque e preço mudados aqui valem para o Gerêncio e todas as plataformas vinculadas.
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#ccc' }}>
          Estoque (un.)
          <input aria-label={`Estoque de ${produto.nome}`} type="number" min="0" value={quantidade} disabled={salvando}
            onChange={(e) => setRascunhoQuantidade(e.target.value)} style={{ ...campo, width: '90px' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#ccc' }}>
          Preço (R$)
          <input aria-label={`Preço de ${produto.nome}`} value={preco} disabled={salvando}
            onChange={(e) => setRascunhoPreco(e.target.value)} style={{ ...campo, width: '100px' }} />
        </label>
        <button type="button" onClick={salvar} disabled={!alterado || salvando} style={{ ...botao, opacity: alterado ? 1 : 0.5 }}>{salvando ? 'Salvando...' : 'Salvar'}</button>
        {alterado && <button type="button" onClick={() => { setRascunhoQuantidade(null); setRascunhoPreco(null); }} disabled={salvando} style={botao}>Descartar</button>}
        {confirmarExclusao ? (
          <>
            <button type="button" onClick={excluir} disabled={salvando} style={{ ...botao, color: tema.erro }}>Confirmar exclusão</button>
            <button type="button" onClick={() => setConfirmarExclusao(false)} disabled={salvando} style={botao}>Manter</button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirmarExclusao(true)} disabled={salvando} style={botao}>Excluir</button>
        )}
      </div>
      {mensagem && <div role="alert" style={{ fontSize: '13px', color: mensagem.erro ? tema.erro : tema.sucesso }}>{mensagem.texto}</div>}
    </div>
  );
}

export default function Restaurante() {
  const [plataforma, setPlataforma] = useState(PLATAFORMAS[0]);
  const [produtos, setProdutos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState('');
  const [preco, setPreco] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [cadastrando, setCadastrando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const plataformaAtual = useRef(plataforma.id);
  plataformaAtual.current = plataforma.id;

  const carregar = useCallback(async () => {
    try {
      const lista = await chamarApi(`/catalogo?plataforma=${plataforma.id}`);
      if (plataformaAtual.current !== plataforma.id) return;
      setProdutos(lista); setErro(null);
    } catch (e) {
      setErro(`Não foi possível carregar o cardápio (${e.message}). A API do mock está rodando?`);
    } finally {
      setCarregando(false);
    }
  }, [plataforma.id]);

  useEffect(() => {
    carregar();
    const intervalo = setInterval(carregar, INTERVALO_ATUALIZACAO_MS);
    return () => clearInterval(intervalo);
  }, [carregar]);

  const trocarPlataforma = (nova) => {
    setPlataforma(nova); setProdutos([]); setCarregando(true); setResultado(null);
  };

  const cadastrar = async (e) => {
    e.preventDefault();
    if (cadastrando) return;
    setCadastrando(true); setResultado(null);
    try {
      const produto = await chamarApi('/catalogo', {
        method: 'POST',
        body: JSON.stringify({ plataforma: plataforma.id, nome, categoria, preco, quantidade: Number(quantidade || 0) }),
      });
      setResultado({ erro: false, produto });
      setNome(''); setCategoria(''); setPreco(''); setQuantidade('');
      await carregar();
    } catch (erroCadastro) {
      setResultado({ erro: true, texto: erroCadastro.message });
    } finally {
      setCadastrando(false);
    }
  };

  return (
    <div style={{ backgroundColor: tema.fundoTela, color: '#fff', minHeight: '100vh', padding: '20px', fontFamily: 'Arial' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px' }}>Portal do restaurante</h1>
            <div style={{ color: tema.apagado, fontSize: '14px' }}>Simula o painel de parceiro de cada plataforma de delivery.</div>
          </div>
          <a href="/" style={{ color: '#ccc', fontSize: '13px' }}>Ir para o app do cliente ➔</a>
        </div>

        <div role="tablist" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {PLATAFORMAS.map((p) => (
            <button key={p.id} type="button" role="tab" aria-selected={p.id === plataforma.id} onClick={() => trocarPlataforma(p)}
              style={{ ...botao, backgroundColor: p.id === plataforma.id ? tema.corPrimaria : '#333', border: 'none' }}>
              {p.nome}
            </button>
          ))}
        </div>

        <form onSubmit={cadastrar} style={{ backgroundColor: tema.fundoCaixa, border: tema.borda, borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h2 style={{ margin: 0, fontSize: '18px' }}>Cadastrar produto no {plataforma.nome}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', color: '#ccc' }}>
              Nome
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: X-Burguer" style={campo} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', color: '#ccc' }}>
              Categoria
              <input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ex.: Lanches" style={campo} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', color: '#ccc' }}>
              Preço (R$)
              <input value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="Ex.: 25,90" inputMode="decimal" style={campo} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', color: '#ccc' }}>
              Quantidade
              <input value={quantidade} onChange={(e) => setQuantidade(e.target.value)} placeholder="Ex.: 20" type="number" min="0" style={campo} />
            </label>
          </div>
          <div>
            <button type="submit" disabled={cadastrando} style={botaoPrimario}>{cadastrando ? 'Cadastrando...' : 'Cadastrar produto'}</button>
          </div>
          {resultado?.erro && <div role="alert" style={{ color: tema.erro, fontSize: '14px' }}>{resultado.texto}</div>}
          {resultado && !resultado.erro && (
            <div role="status" style={{ backgroundColor: '#13261a', border: `1px solid ${tema.sucesso}`, borderRadius: '8px', padding: '12px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span>Produto cadastrado! ID no {plataforma.nome}:</span>
              <code style={{ fontSize: '18px', fontWeight: 'bold' }}>{resultado.produto.idExterno}</code>
              <BotaoCopiar texto={resultado.produto.idExterno} />
              <span style={{ fontSize: '12px', color: '#ccc', flexBasis: '100%' }}>Use este ID em "Vincular produto", na página de Estoque do Gerêncio.</span>
            </div>
          )}
        </form>

        <div style={{ backgroundColor: tema.fundoCaixa, border: tema.borda, borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h2 style={{ margin: 0, fontSize: '18px' }}>Cardápio no {plataforma.nome} ({produtos.length})</h2>
          {erro && <div role="alert" style={{ color: tema.erro, fontSize: '14px' }}>{erro}</div>}
          {carregando && <div style={{ color: tema.apagado }}>Carregando cardápio...</div>}
          {!carregando && !erro && produtos.length === 0 && <div style={{ color: tema.apagado }}>Nenhum produto cadastrado nesta plataforma.</div>}
          {produtos.map((produto) => (
            <ProdutoDoCardapio key={produto.idExterno} produto={produto} plataforma={plataforma} aoAlterar={carregar} />
          ))}
        </div>
      </div>
    </div>
  );
}
