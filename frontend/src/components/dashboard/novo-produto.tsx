import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Campo, SeletorRestaurante } from './formularios';
import { Botao, Cartao, Texto } from './ui';
import { Espacamento } from '@/constants/tokens';
import { criarProduto, type Restaurante } from '@/services/api-produtos';

export function FormularioProduto({ restaurantes, restauranteInicial, onConcluir, onFechar }: {
  restaurantes: Restaurante[]; restauranteInicial?: number; onConcluir: (restauranteId: number, produtoId: number) => void; onFechar: () => void;
}) {
  const [restauranteId, setRestauranteId] = useState<number | undefined>(restauranteInicial ?? restaurantes[0]?.id);
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState('');
  const [preco, setPreco] = useState('');
  const [quantidade, setQuantidade] = useState('0');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const enviando = useRef(false);

  const salvar = async () => {
    if (enviando.current) return;
    const valor = Number(preco.replace(',', '.'));
    const saldo = Number(quantidade);
    if (!nome.trim() || !restauranteId || !preco.trim() || !Number.isFinite(valor) || valor < 0 ||
        !quantidade.trim() || !Number.isInteger(saldo) || saldo < 0) {
      setErro('Informe nome, restaurante, preço válido e quantidade inteira não negativa.'); return;
    }
    enviando.current = true; setSalvando(true); setErro(null);
    try {
      const produto = await criarProduto({ nome: nome.trim(), categoria: categoria.trim() || 'Sem categoria', preco: valor, quantidade: saldo, restauranteId });
      onConcluir(restauranteId, produto.id);
    } catch (e) { setErro((e as Error).message); }
    finally { enviando.current = false; setSalvando(false); }
  };

  return <Cartao style={styles.formulario}>
    <Texto tamanho={20} peso={600}>Cadastrar produto</Texto>
    <SeletorRestaurante restaurantes={restaurantes} valor={restauranteId} onChange={setRestauranteId} desabilitado={salvando} />
    <Campo rotulo="Nome do produto" value={nome} onChangeText={setNome} editable={!salvando} />
    <Campo rotulo="Categoria" value={categoria} onChangeText={setCategoria} editable={!salvando} />
    <Campo rotulo="Preço (R$)" value={preco} onChangeText={setPreco} keyboardType="decimal-pad" editable={!salvando} />
    <Campo rotulo="Quantidade inicial" value={quantidade} onChangeText={setQuantidade} keyboardType="number-pad" editable={!salvando} />
    {erro && <Texto cor="feedbackErro" accessibilityRole="alert">{erro}</Texto>}
    <View style={styles.linha}>
      <Botao rotulo={salvando ? 'Salvando…' : 'Cadastrar'} variante="primario" disabled={salvando} onPress={salvar} />
      <Botao rotulo="Fechar" disabled={salvando} onPress={onFechar} />
    </View>
  </Cartao>;
}

const styles = StyleSheet.create({
  formulario: { gap: Espacamento.large },
  linha: { flexDirection: 'row', flexWrap: 'wrap', gap: Espacamento.small },
});
