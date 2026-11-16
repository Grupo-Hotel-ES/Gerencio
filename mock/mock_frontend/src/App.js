import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';

// Endereço da API do mock (mock_backend/mock_api): guarda os pedidos e o cardápio de cada plataforma
const API_URL = process.env.REACT_APP_MOCK_API_URL || 'http://localhost:3333';
// O saldo muda com pedidos de outros clientes e com a sincronização do Gerêncio
const INTERVALO_ATUALIZACAO_MS = 5000;

// O cardápio da plataforma não tem imagem; mostra um ícone no lugar
function ImagemProduto({ produto, tamanho }) {
  const estilo = { width: tamanho, height: tamanho, borderRadius: '8px', objectFit: 'cover', marginRight: '15px', flexShrink: 0 };
  if (produto.img) return <img src={produto.img} alt={produto.nome} style={estilo} />;
  return <div style={{ ...estilo, backgroundColor: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: tamanho / 2 }}>🍽️</div>;
}

export default function App() {
  // 1. A "Memória" do aplicativo (Nosso interruptor de luz começa no 'pedido')
  const [abaAtiva, setAbaAtiva] = useState('pedido');
  const [carrinho, setCarrinho] = useState({});

  // Dados do formulário
  const [appSelecionado, setAppSelecionado] = useState('ifood');
  const [nome, setNome] = useState('');
  const [endereco, setEndereco] = useState('');
  const [enviando, setEnviando] = useState(false);

  // 2. O cardápio da plataforma escolhida: o restaurante cadastra no portal (/restaurante)
  // e cada produto tem o ID e o estoque daquela plataforma.
  const [produtosDaPlataforma, setProdutosDaPlataforma] = useState([]);
  const [erroProdutos, setErroProdutos] = useState(null);
  const [carregandoProdutos, setCarregandoProdutos] = useState(true);
  // Evita que a resposta atrasada de uma plataforma apareça depois de trocar para outra
  const plataformaAtual = useRef(appSelecionado);
  plataformaAtual.current = appSelecionado;

  const carregarCardapio = useCallback(() => {
    return fetch(`${API_URL}/catalogo?plataforma=${encodeURIComponent(appSelecionado)}`)
      .then(resposta => {
        if (!resposta.ok) throw new Error(`Erro ${resposta.status}`);
        return resposta.json();
      })
      .then(lista => {
        if (plataformaAtual.current !== appSelecionado) return;
        // O id do produto no carrinho é o ID que a plataforma gerou (idExterno)
        setProdutosDaPlataforma(lista.map(produto => ({ ...produto, id: produto.idExterno, preco: produto.precoCentavos / 100 })));
        setErroProdutos(null);
      })
      .catch(erro => setErroProdutos(erro.message))
      .finally(() => setCarregandoProdutos(false));
  }, [appSelecionado]);

  useEffect(() => {
    carregarCardapio();
    const intervalo = setInterval(carregarCardapio, INTERVALO_ATUALIZACAO_MS);
    return () => clearInterval(intervalo);
  }, [carregarCardapio]);

  // Pedir mais do que o saldo é permitido no carrinho, mas a plataforma recusa o pedido.
  // Produto com estoque zero fica indisponível: continua no cardápio, mas não entra no carrinho.
  const indisponivel = (produto) => produto.quantidade === 0;
  const acimaDoEstoque = (produto) => (carrinho[produto.id] || 0) > produto.quantidade;

  // Cada plataforma tem seu cardápio, então trocar de plataforma esvazia o carrinho
  const trocarPlataforma = (plataforma) => {
    setAppSelecionado(plataforma);
    setCarrinho({});
    setProdutosDaPlataforma([]);
    setCarregandoProdutos(true);
  };

  // 3. A Lógica Matemática
  const adicionarAoCarrinho = (id) => {
    setCarrinho(memoriaAntiga => ({
      ...memoriaAntiga,
      [id]: (memoriaAntiga[id] || 0) + 1
    }));
  };

  const diminuirDoCarrinho = (id) => {
    setCarrinho(memoriaAntiga => {
      const novaQtd = (memoriaAntiga[id] || 0) - 1;
      const novoCarrinho = { ...memoriaAntiga };
      if (novaQtd <= 0) {
        delete novoCarrinho[id];
      } else {
        novoCarrinho[id] = novaQtd;
      }
      return novoCarrinho;
    });
  };

  const removerTudoDoProduto = (id) => {
    setCarrinho(memoriaAntiga => {
      const novoCarrinho = { ...memoriaAntiga };
      delete novoCarrinho[id];
      return novoCarrinho;
    });
  };

  const valorTotal = produtosDaPlataforma.reduce((soma, produto) => {
    const quantidade = carrinho[produto.id] || 0;
    return soma + (produto.preco * quantidade);
  }, 0);

  // A função final de pagamento agora verifica se o usuário preencheu a Aba 1
  const enviarMock = async (e) => {
    e.preventDefault();
    if (enviando) return;

    // Verifica se os dados do outro cômodo foram preenchidos
    if (!nome || !endereco) {
      alert("Por favor, preencha seu Nome e Endereço primeiro!");
      setAbaAtiva('pedido'); // Leva o usuário de volta pra primeira aba automaticamente!
      return;
    }
    
    if (valorTotal === 0) return alert("Seu carrinho está vazio!");

    // Monta os itens do carrinho no formato da API: o código é o ID do produto na plataforma
    const itens = produtosDaPlataforma
      .filter(produto => carrinho[produto.id])
      .map(produto => ({
        codigoExterno: produto.idExterno,
        nome: produto.nome,
        quantidade: carrinho[produto.id],
        precoUnitarioCentavos: produto.precoCentavos
      }));

    setEnviando(true);
    try {
      const resposta = await fetch(`${API_URL}/pedidos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plataforma: appSelecionado, cliente: { nome }, endereco, itens })
      });
      const pedido = await resposta.json();
      if (!resposta.ok) throw new Error(pedido.erro || `Erro ${resposta.status}`);

      alert(`Mock: Pedido #${pedido.codigoExibicao} de R$ ${(pedido.totalCentavos / 100).toFixed(2)} para ${nome} enviado pelo ${appSelecionado}!`);
      setCarrinho({});
      setAbaAtiva('pedido');
    } catch (erro) {
      // Ex.: "Acima do limite do estoque: X-Burguer tem 3 unidades disponíveis no iFood" ou "X-Burguer está indisponível no iFood"
      alert(`Erro ao realizar pedido\n\n${erro.message}`);
    } finally {
      setEnviando(false);
      carregarCardapio();
    }
  };

  // 4. O "Plástico" dos blocos de montar (Cores)
  const tema = { fundoTela: '#121212', fundoCaixa: '#1e1e1e', textoPrincipal: '#ffffff', borda: '1px solid #333', corPrimaria: '#ea1d2c' };

  return (
    <div style={{ backgroundColor: tema.fundoTela, color: tema.textoPrincipal, minHeight: '100vh', padding: '20px', fontFamily: 'Arial' }}>
      
      <div style={{ maxWidth: '400px', margin: '0 auto', backgroundColor: tema.fundoCaixa, padding: '20px', borderRadius: '10px', border: tema.borda, position: 'relative' }}>
        
        <a href="/restaurante" style={{ display: 'block', textAlign: 'right', fontSize: '13px', color: '#ccc', marginBottom: '12px' }}>Portal do restaurante ➔</a>

        {/* INTERRUPTORES DOS CÔMODOS (As abas no topo) */}
        <div style={{ display: 'flex', gap: '5px', marginBottom: '20px' }}>
          <button onClick={() => setAbaAtiva('pedido')} style={{ flex: 1, padding: '12px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontWeight: 'bold', backgroundColor: abaAtiva === 'pedido' ? tema.corPrimaria : '#333', color: '#fff' }}>Realizar Pedido</button>
          <button onClick={() => setAbaAtiva('cardapio')} style={{ flex: 1, padding: '12px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontWeight: 'bold', backgroundColor: abaAtiva === 'cardapio' ? tema.corPrimaria : '#333', color: '#fff' }}>Cardápio</button>
        </div>

        {/* CÔMODO 1: DADOS DO PEDIDO */}
        <div style={{ display: abaAtiva === 'pedido' ? 'block' : 'none' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            
            <label style={{ fontSize: '13px', color: '#ccc', marginBottom: '-10px' }}>Simular via Plataforma:</label>
            <select value={appSelecionado} onChange={(e) => trocarPlataforma(e.target.value)} style={{ padding: '12px', borderRadius: '5px', backgroundColor: '#333', color: '#fff', border: tema.borda }}>
              <option value="ifood">iFood</option>
              <option value="99 food">99 Food</option>
              <option value="uber eats">Uber Eats</option>
              <option value="keeta">Keeta</option>
              <option value="rappi">Rappi</option>
            </select>

            <label style={{ fontSize: '13px', color: '#ccc', marginBottom: '-10px' }}>Nome do Cliente:</label>
            <input type="text" placeholder="Ex: Renan Santos" value={nome} onChange={(e) => setNome(e.target.value)} style={{ padding: '12px', borderRadius: '5px', backgroundColor: '#333', color: '#fff', border: tema.borda }} />

            <label style={{ fontSize: '13px', color: '#ccc', marginBottom: '-10px' }}>Endereço para Entrega:</label>
            <input type="text" placeholder="Ex: Rua das Flores, 123" value={endereco} onChange={(e) => setEndereco(e.target.value)} style={{ padding: '12px', borderRadius: '5px', backgroundColor: '#333', color: '#fff', border: tema.borda }} />

            {/* Botão que apenas troca a luz para o cômodo do carrinho */}
            <button onClick={() => setAbaAtiva('carrinho')} style={{ padding: '15px', backgroundColor: '#333', color: 'white', border: tema.borda, borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', marginTop: '10px' }}>
              Ir para o Carrinho ➔
            </button>
            
          </div>
        </div>

        {/* CÔMODO 2: CARDÁPIO */}
        <div style={{ display: abaAtiva === 'cardapio' ? 'block' : 'none', paddingBottom: '60px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {erroProdutos && <p style={{ textAlign: 'center', color: '#e74c3c' }}>Não foi possível carregar o cardápio ({erroProdutos}). A API do mock está rodando?</p>}
            {carregandoProdutos && <p style={{ textAlign: 'center', color: '#666' }}>Carregando cardápio...</p>}
            {!carregandoProdutos && !erroProdutos && produtosDaPlataforma.length === 0 && <p style={{ textAlign: 'center', color: '#666' }}>Nenhum produto no cardápio desta plataforma. Cadastre no <a href="/restaurante" style={{ color: '#ccc' }}>portal do restaurante</a>.</p>}
            {produtosDaPlataforma.map((item) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', backgroundColor: '#2a2a2a', borderRadius: '8px', padding: '10px', opacity: indisponivel(item) ? 0.6 : 1 }}>
                
                <ImagemProduto produto={item} tamanho={70} />
                
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: '0 0 5px 0', fontSize: '15px' }}>{item.nome}</h4>
                  <div style={{ fontSize: '12px', color: '#999', marginBottom: '5px' }}>{item.categoria}</div>
                  <span style={{ color: '#27ae60', fontWeight: 'bold' }}>R$ {item.preco.toFixed(2).replace('.', ',')}</span>
                  <div style={{ fontSize: '12px', color: indisponivel(item) ? '#e74c3c' : '#999', marginTop: '5px', fontWeight: indisponivel(item) ? 'bold' : 'normal' }}>
                    {indisponivel(item) ? 'Indisponível' : `Estoque: ${item.quantidade} un.`}
                  </div>
                  {acimaDoEstoque(item) && !indisponivel(item) && <div style={{ fontSize: '12px', color: '#e74c3c', fontWeight: 'bold', marginTop: '3px' }}>Acima do limite do estoque</div>}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#121212', borderRadius: '5px', border: tema.borda }}>
                  <button onClick={() => diminuirDoCarrinho(item.id)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', width: '30px', height: '30px', cursor: 'pointer' }}>-</button>
                  <div style={{ width: '25px', textAlign: 'center', fontWeight: 'bold' }}>{carrinho[item.id] || 0}</div>
                  <button onClick={() => adicionarAoCarrinho(item.id)} disabled={indisponivel(item)} aria-label={`Adicionar ${item.nome}`} style={{ background: 'none', border: 'none', color: indisponivel(item) ? '#555' : tema.corPrimaria, fontSize: '18px', width: '30px', height: '30px', cursor: indisponivel(item) ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>+</button>
                </div>
              </div>
            ))}
          </div>

          {valorTotal > 0 && (
            <div onClick={() => setAbaAtiva('carrinho')} style={{ position: 'absolute', bottom: '15px', left: '15px', right: '15px', backgroundColor: tema.corPrimaria, padding: '15px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', boxShadow: '0px -2px 10px rgba(0,0,0,0.5)', cursor: 'pointer' }}>
              <span>Ver Carrinho</span>
              <span>R$ {valorTotal.toFixed(2).replace('.', ',')}</span>
            </div>
          )}
        </div>


        {/* CÔMODO 3: CARRINHO */}
        <div style={{ display: abaAtiva === 'carrinho' ? 'block' : 'none' }}>
          <h3 style={{ marginTop: 0, borderBottom: '1px solid #333', paddingBottom: '10px' }}>Itens Selecionados</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
            {produtosDaPlataforma.map(item => {
              const qtd = carrinho[item.id];
              if (!qtd) return null;

              return (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', backgroundColor: '#2a2a2a', padding: '10px', borderRadius: '5px' }}>
                  <ImagemProduto produto={item} tamanho={40} />
                  <div style={{ flex: 1, fontSize: '14px' }}>
                    {item.nome}
                    {acimaDoEstoque(item) && <div style={{ fontSize: '12px', color: '#e74c3c', fontWeight: 'bold' }}>{indisponivel(item) ? 'Indisponível' : `Acima do limite do estoque (${item.quantidade} disponíveis)`}</div>}
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#121212', borderRadius: '5px', marginRight: '10px' }}>
                    <button onClick={() => diminuirDoCarrinho(item.id)} style={{ background: 'none', border: 'none', color: '#fff', width: '25px', height: '25px', cursor: 'pointer' }}>-</button>
                    <div style={{ width: '20px', textAlign: 'center', fontSize: '14px' }}>{qtd}</div>
                    <button onClick={() => adicionarAoCarrinho(item.id)} disabled={indisponivel(item)} style={{ background: 'none', border: 'none', color: indisponivel(item) ? '#555' : tema.corPrimaria, width: '25px', height: '25px', cursor: indisponivel(item) ? 'not-allowed' : 'pointer' }}>+</button>
                  </div>
                  
                  <button onClick={() => removerTudoDoProduto(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>🗑️</button>
                </div>
              )
            })}
            
            {valorTotal === 0 && <p style={{ textAlign: 'center', color: '#666' }}>Seu carrinho está vazio.</p>}
          </div>

          {/* ÁREA DE PAGAMENTO */}
          <div style={{ borderTop: '1px solid #333', paddingTop: '15px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 'bold' }}>
              <span>Total:</span>
              <span>R$ {valorTotal.toFixed(2).replace('.', ',')}</span>
            </div>

            {/* O botão mágico que verifica tudo e finaliza */}
            <button onClick={enviarMock} style={{ padding: '15px', backgroundColor: valorTotal > 0 ? '#27ae60' : '#444', color: 'white', border: 'none', borderRadius: '5px', cursor: valorTotal > 0 ? 'pointer' : 'not-allowed', fontWeight: 'bold', fontSize: '16px' }}>
              {enviando ? 'Enviando...' : 'Opção de Pagamento'}
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
