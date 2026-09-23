import React, { useState } from 'react';
import './App.css';

// Endereço da API do mock (mock_backend/mock_api), que grava os pedidos no banco do mock
const API_URL = process.env.REACT_APP_MOCK_API_URL || 'http://localhost:3333';

export default function App() {
  // 1. Os dados dos produtos 
  const produtos = [
    { id: 1, nome: 'Chicken Junior', preco: 4.00, img: 'CHICKENJUNIOR.jpg' },
    { id: 2, nome: 'X-Tudo Burguer', preco: 25.00, img: 'X-TUDO.jpg' },
    { id: 3, nome: 'Espetinho de Carne', preco: 17.00, img: 'ESPETINHO_CARNE.jpg' },
    { id: 4, nome: 'Pizza', preco: 17.00, img: 'PIZZA.jpg' }
  ];

  // 2. A "Memória" do aplicativo (Nosso interruptor de luz começa no 'pedido')
  const [abaAtiva, setAbaAtiva] = useState('pedido');
  const [carrinho, setCarrinho] = useState({});
  
  // Dados do formulário
  const [appSelecionado, setAppSelecionado] = useState('ifood');
  const [nome, setNome] = useState('');
  const [endereco, setEndereco] = useState('');
  const [enviando, setEnviando] = useState(false);

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

  const valorTotal = produtos.reduce((soma, produto) => {
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
    
    // Monta os itens do carrinho no formato da API (preços em centavos)
    const itens = produtos
      .filter(produto => carrinho[produto.id])
      .map(produto => ({
        codigoExterno: produto.id,
        nome: produto.nome,
        quantidade: carrinho[produto.id],
        precoUnitarioCentavos: Math.round(produto.preco * 100)
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
      alert(`Não foi possível enviar o pedido: ${erro.message}`);
    } finally {
      setEnviando(false);
    }
  };

  // 4. O "Plástico" dos blocos de montar (Cores)
  const tema = { fundoTela: '#121212', fundoCaixa: '#1e1e1e', textoPrincipal: '#ffffff', borda: '1px solid #333', corPrimaria: '#ea1d2c' };

  return (
    <div style={{ backgroundColor: tema.fundoTela, color: tema.textoPrincipal, minHeight: '100vh', padding: '20px', fontFamily: 'Arial' }}>
      
      <div style={{ maxWidth: '400px', margin: '0 auto', backgroundColor: tema.fundoCaixa, padding: '20px', borderRadius: '10px', border: tema.borda, position: 'relative' }}>
        
        {/* INTERRUPTORES DOS CÔMODOS (As abas no topo) */}
        <div style={{ display: 'flex', gap: '5px', marginBottom: '20px' }}>
          <button onClick={() => setAbaAtiva('pedido')} style={{ flex: 1, padding: '12px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontWeight: 'bold', backgroundColor: abaAtiva === 'pedido' ? tema.corPrimaria : '#333', color: '#fff' }}>Realizar Pedido</button>
          <button onClick={() => setAbaAtiva('cardapio')} style={{ flex: 1, padding: '12px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontWeight: 'bold', backgroundColor: abaAtiva === 'cardapio' ? tema.corPrimaria : '#333', color: '#fff' }}>Cardápio</button>
        </div>

        {/* CÔMODO 1: DADOS DO PEDIDO */}
        <div style={{ display: abaAtiva === 'pedido' ? 'block' : 'none' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            
            <label style={{ fontSize: '13px', color: '#ccc', marginBottom: '-10px' }}>Simular via Plataforma:</label>
            <select value={appSelecionado} onChange={(e) => setAppSelecionado(e.target.value)} style={{ padding: '12px', borderRadius: '5px', backgroundColor: '#333', color: '#fff', border: tema.borda }}>
              <option value="ifood">iFood</option>
              <option value="99 food">99 Food</option>
              <option value="uber eats">Uber Eats</option>
              <option value="keeta">Keeta</option>
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
            {produtos.map((item) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', backgroundColor: '#2a2a2a', borderRadius: '8px', padding: '10px' }}>
                
                <img src={item.img} alt={item.nome} style={{ width: '70px', height: '70px', borderRadius: '8px', objectFit: 'cover', marginRight: '15px' }} />
                
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: '0 0 5px 0', fontSize: '15px' }}>{item.nome}</h4>
                  <span style={{ color: '#27ae60', fontWeight: 'bold' }}>R$ {item.preco.toFixed(2).replace('.', ',')}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#121212', borderRadius: '5px', border: tema.borda }}>
                  <button onClick={() => diminuirDoCarrinho(item.id)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', width: '30px', height: '30px', cursor: 'pointer' }}>-</button>
                  <div style={{ width: '25px', textAlign: 'center', fontWeight: 'bold' }}>{carrinho[item.id] || 0}</div>
                  <button onClick={() => adicionarAoCarrinho(item.id)} style={{ background: 'none', border: 'none', color: tema.corPrimaria, fontSize: '18px', width: '30px', height: '30px', cursor: 'pointer', fontWeight: 'bold' }}>+</button>
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
            {produtos.map(item => {
              const qtd = carrinho[item.id];
              if (!qtd) return null;

              return (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', backgroundColor: '#2a2a2a', padding: '10px', borderRadius: '5px' }}>
                  <img src={item.img} alt={item.nome} style={{ width: '40px', height: '40px', borderRadius: '5px', objectFit: 'cover', marginRight: '10px' }} />
                  <div style={{ flex: 1, fontSize: '14px' }}>{item.nome}</div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#121212', borderRadius: '5px', marginRight: '10px' }}>
                    <button onClick={() => diminuirDoCarrinho(item.id)} style={{ background: 'none', border: 'none', color: '#fff', width: '25px', height: '25px', cursor: 'pointer' }}>-</button>
                    <div style={{ width: '20px', textAlign: 'center', fontSize: '14px' }}>{qtd}</div>
                    <button onClick={() => adicionarAoCarrinho(item.id)} style={{ background: 'none', border: 'none', color: tema.corPrimaria, width: '25px', height: '25px', cursor: 'pointer' }}>+</button>
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