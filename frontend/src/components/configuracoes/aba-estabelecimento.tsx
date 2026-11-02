import { useState } from 'react';
import { View } from 'react-native';

import { Alternador, CampoTexto, Colunas, RodapeSalvar, estilos, formatarNumero, lerNumero } from './campos';
import { Cartao, Divisor, Etiqueta, Texto } from '@/components/dashboard/ui';
import { usePerfil } from '@/data/perfil-context';
import { useSessao } from '@/data/sessao';
import { useCores } from '@/hooks/use-cores';
import { rotuloPapel, type Restaurante } from '@/services/api-conta';

type Formulario = {
  nome: string; razaoSocial: string; cnpj: string; categoria: string; telefone: string; email: string;
  cep: string; cidade: string; uf: string; logradouro: string; numero: string; complemento: string; bairro: string;
  taxaEntregaBase: string; kmInclusosTaxaBase: string; custoPorKmAdicional: string; distanciaMaximaKm: string;
  lojaAberta: boolean; fusoHorario: string; diasFuncionamento: string; abertura: string; fechamento: string;
  entregaPropria: boolean; retiradaLocal: boolean;
};

function paraFormulario(r: Restaurante): Formulario {
  const operacao = r.configuracoes.operacao ?? {};
  return {
    nome: r.nome, razaoSocial: r.razaoSocial, cnpj: r.cnpj, categoria: r.categoria, telefone: r.telefone, email: r.email,
    cep: r.cep, cidade: r.cidade, uf: r.uf, logradouro: r.logradouro, numero: r.numero, complemento: r.complemento, bairro: r.bairro,
    taxaEntregaBase: formatarNumero(r.taxaEntregaBase),
    kmInclusosTaxaBase: formatarNumero(r.kmInclusosTaxaBase),
    custoPorKmAdicional: formatarNumero(r.custoPorKmAdicional),
    distanciaMaximaKm: formatarNumero(r.distanciaMaximaKm),
    lojaAberta: operacao.lojaAberta ?? true,
    fusoHorario: operacao.fusoHorario ?? 'Brasília (GMT-3)',
    diasFuncionamento: operacao.diasFuncionamento ?? '',
    abertura: operacao.abertura ?? '',
    fechamento: operacao.fechamento ?? '',
    entregaPropria: operacao.entregaPropria ?? true,
    retiradaLocal: operacao.retiradaLocal ?? true,
  };
}

/** Dados, endereço, regras de entrega e operação do restaurante (único) do app. */
export function AbaEstabelecimento({ restaurante, emColunas }: { restaurante: Restaurante; emColunas: boolean }) {
  const cores = useCores();
  const { usuario } = useSessao();
  const { atualizarRestaurante, podeEditarRestaurante: podeEditar } = usePerfil();
  const [form, setForm] = useState<Formulario>(() => paraFormulario(restaurante));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const campo = <K extends keyof Formulario>(chave: K) => (valor: Formulario[K]) => {
    setForm((atual) => ({ ...atual, [chave]: valor }));
    setSalvo(false);
  };

  const salvar = async () => {
    const taxa = lerNumero(form.taxaEntregaBase);
    const kmInclusos = lerNumero(form.kmInclusosTaxaBase);
    const custoKm = lerNumero(form.custoPorKmAdicional);
    const distanciaMaxima = lerNumero(form.distanciaMaximaKm);
    if (!form.nome.trim()) { setErro('Informe o nome do estabelecimento.'); return; }
    if ([taxa, kmInclusos, custoKm].some((n) => n === null || Number.isNaN(n) || n < 0)) {
      setErro('As regras de entrega precisam ser números maiores ou iguais a zero.'); return;
    }
    if (distanciaMaxima !== null && (Number.isNaN(distanciaMaxima) || distanciaMaxima <= 0)) {
      setErro('A distância máxima deve ser maior que zero, ou vazia para não ter limite.'); return;
    }
    setSalvando(true); setErro(null);
    try {
      const atualizado = await atualizarRestaurante({
        nome: form.nome, razaoSocial: form.razaoSocial, cnpj: form.cnpj, categoria: form.categoria,
        telefone: form.telefone, email: form.email,
        cep: form.cep, cidade: form.cidade, uf: form.uf.toUpperCase(), logradouro: form.logradouro,
        numero: form.numero, complemento: form.complemento, bairro: form.bairro,
        taxaEntregaBase: taxa!, kmInclusosTaxaBase: kmInclusos!, custoPorKmAdicional: custoKm!, distanciaMaximaKm: distanciaMaxima,
        configuracoes: {
          operacao: {
            lojaAberta: form.lojaAberta, fusoHorario: form.fusoHorario, diasFuncionamento: form.diasFuncionamento,
            abertura: form.abertura, fechamento: form.fechamento,
            entregaPropria: form.entregaPropria, retiradaLocal: form.retiradaLocal,
          },
        },
      });
      setForm(paraFormulario(atualizado));
      setSalvo(true);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const principal = (
    <>
      <Cartao style={estilos.cartaoForm}>
        <Texto accessibilityRole="header" tamanho={18} peso={600}>Dados do estabelecimento</Texto>
        <Texto tamanho={13} cor="textoSecundario">
          O nome aparece no painel, na tela de login e nos links de pagamento.
        </Texto>
        <View style={estilos.linhaDupla}>
          <CampoTexto flex={1} rotulo="Nome do estabelecimento *" value={form.nome} onChangeText={campo('nome')} editable={podeEditar} />
          <CampoTexto flex={1} rotulo="Razão social" value={form.razaoSocial} onChangeText={campo('razaoSocial')} editable={podeEditar} />
        </View>
        <View style={estilos.linhaDupla}>
          <CampoTexto flex={1} rotulo="CNPJ" value={form.cnpj} onChangeText={campo('cnpj')} editable={podeEditar} />
          <CampoTexto flex={1} rotulo="Categoria" value={form.categoria} onChangeText={campo('categoria')} editable={podeEditar} />
        </View>
        <View style={estilos.linhaDupla}>
          <CampoTexto flex={1} rotulo="Telefone" value={form.telefone} onChangeText={campo('telefone')} keyboardType="phone-pad" editable={podeEditar} />
          <CampoTexto flex={1} rotulo="E-mail de contato" value={form.email} onChangeText={campo('email')} keyboardType="email-address" autoCapitalize="none" editable={podeEditar} />
        </View>
      </Cartao>

      <Cartao style={estilos.cartaoForm}>
        <Texto accessibilityRole="header" tamanho={18} peso={600}>Endereço</Texto>
        <Texto tamanho={13} cor="textoSecundario">
          Ponto de saída das entregas: o frete e as rotas são calculados a partir dele. Ao mudar o endereço, a localização no mapa é buscada de novo.
        </Texto>
        <View style={estilos.linhaDupla}>
          <CampoTexto flex={1} rotulo="CEP" value={form.cep} onChangeText={campo('cep')} keyboardType="number-pad" editable={podeEditar} />
          <CampoTexto flex={2} rotulo="Cidade" value={form.cidade} onChangeText={campo('cidade')} editable={podeEditar} />
          <CampoTexto flex={0.5} rotulo="UF" value={form.uf} onChangeText={campo('uf')} maxLength={2} autoCapitalize="characters" editable={podeEditar} />
        </View>
        <View style={estilos.linhaDupla}>
          <CampoTexto flex={3} rotulo="Logradouro" value={form.logradouro} onChangeText={campo('logradouro')} editable={podeEditar} />
          <CampoTexto flex={1} rotulo="Número" value={form.numero} onChangeText={campo('numero')} editable={podeEditar} />
        </View>
        <View style={estilos.linhaDupla}>
          <CampoTexto flex={1} rotulo="Complemento" value={form.complemento} onChangeText={campo('complemento')} editable={podeEditar} />
          <CampoTexto flex={1} rotulo="Bairro" value={form.bairro} onChangeText={campo('bairro')} editable={podeEditar} />
        </View>
      </Cartao>

      <Cartao style={estilos.cartaoForm}>
        <Texto accessibilityRole="header" tamanho={18} peso={600}>Regras de entrega</Texto>
        <Texto tamanho={13} cor="textoSecundario">
          Taxa = taxa base + custo por km × (distância pelas ruas − km inclusos). Vale para os pedidos de WhatsApp e balcão.
        </Texto>
        <View style={estilos.linhaDupla}>
          <CampoTexto flex={1} rotulo="Taxa base (R$)" value={form.taxaEntregaBase} onChangeText={campo('taxaEntregaBase')} keyboardType="decimal-pad" editable={podeEditar} />
          <CampoTexto flex={1} rotulo="Km inclusos na taxa base" value={form.kmInclusosTaxaBase} onChangeText={campo('kmInclusosTaxaBase')} keyboardType="decimal-pad" editable={podeEditar} />
        </View>
        <View style={estilos.linhaDupla}>
          <CampoTexto flex={1} rotulo="Custo por km adicional (R$)" value={form.custoPorKmAdicional} onChangeText={campo('custoPorKmAdicional')} keyboardType="decimal-pad" editable={podeEditar} />
          <CampoTexto flex={1} rotulo="Distância máxima (km)" value={form.distanciaMaximaKm} onChangeText={campo('distanciaMaximaKm')} keyboardType="decimal-pad" placeholder="Sem limite" ajuda="Vazio: entrega a qualquer distância." editable={podeEditar} />
        </View>
      </Cartao>

      <RodapeSalvar
        mensagem={!podeEditar ? 'Somente administradores e gerentes alteram o estabelecimento.' : salvo ? '✓ Alterações salvas.' : '* Campo obrigatório'}
        erro={erro}
        salvando={salvando}
        podeSalvar={podeEditar}
        onCancelar={() => { setForm(paraFormulario(restaurante)); setErro(null); setSalvo(false); }}
        onSalvar={salvar}
      />
    </>
  );

  const lateral = (
    <>
      <Cartao style={estilos.cartaoLateral}>
        <Texto accessibilityRole="header" tamanho={18} peso={600}>Operação da loja</Texto>
        <View style={{ alignSelf: 'flex-start' }}>
          <Etiqueta rotulo={form.lojaAberta ? 'Loja aberta' : 'Loja fechada'} corPonto={form.lojaAberta ? cores.statusEntregue : cores.statusCancelado} />
        </View>
        <Alternador rotulo="Loja aberta" descricao="Aparece na barra superior do painel." valor={form.lojaAberta} onChange={campo('lojaAberta')} desabilitado={!podeEditar} />
        <CampoTexto rotulo="Fuso horário" value={form.fusoHorario} onChangeText={campo('fusoHorario')} editable={podeEditar} />
        <CampoTexto rotulo="Dias de funcionamento" value={form.diasFuncionamento} onChangeText={campo('diasFuncionamento')} placeholder="Ex.: Segunda a sábado" editable={podeEditar} />
        <View style={estilos.linhaDupla}>
          <CampoTexto flex={1} rotulo="Abertura" value={form.abertura} onChangeText={campo('abertura')} placeholder="11:00" editable={podeEditar} />
          <CampoTexto flex={1} rotulo="Fechamento" value={form.fechamento} onChangeText={campo('fechamento')} placeholder="22:00" editable={podeEditar} />
        </View>
        <Divisor />
        <Alternador rotulo="Entrega própria" descricao="Organizar entregas no módulo Rotas." valor={form.entregaPropria} onChange={campo('entregaPropria')} desabilitado={!podeEditar} />
        <Alternador rotulo="Retirada no local" descricao="Permitir a modalidade retirada." valor={form.retiradaLocal} onChange={campo('retiradaLocal')} desabilitado={!podeEditar} />
        <Texto tamanho={13} cor="textoSecundario">
          O horário serve como referência da operação. Revise o funcionamento em cada plataforma.
        </Texto>
      </Cartao>

      <Cartao style={estilos.cartaoLateral}>
        <Texto accessibilityRole="header" tamanho={18} peso={600}>Você</Texto>
        <Texto tamanho={16} peso={500}>{usuario?.nome}</Texto>
        <Texto tamanho={13} cor="textoSecundario">
          {usuario ? `${rotuloPapel(usuario.papel)} • usuário ${usuario.login}` : ''}
        </Texto>
        <Texto tamanho={13} cor="textoSecundario">
          Para alterar acessos, abra Usuários e permissões.
        </Texto>
      </Cartao>
    </>
  );

  return <Colunas emColunas={emColunas} principal={principal} lateral={lateral} />;
}
