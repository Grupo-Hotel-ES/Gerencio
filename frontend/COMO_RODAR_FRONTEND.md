# Como Rodar e Visualizar o Frontend — Gerêncio

Guia passo a passo para qualquer integrante da equipe rodar e navegar por todas as telas do frontend na sua máquina local.

---

## 1. Pré-requisitos

- **Node.js** (versão 20 ou superior recomendada)
- **pnpm** instalado globalmente (`npm install -g pnpm` ou via `corepack enable`)

> [!TIP]
> **Usuários de Windows:** antes de baixar dependências ou puxar branches, ative o suporte a caminhos longos no Git para evitar erros com pastas aninhadas do pnpm:
> ```bash
> git config --global core.longpaths true
> ```

---

## 2. Passo a Passo para Subir o Frontend

Você **não** precisa subir banco de dados nem Docker para visualizar o design e o fluxo das páginas no navegador.

```bash
# 1. Puxe as atualizações mais recentes
git pull origin develop

# 2. Acesse a pasta do frontend e instale as dependências
cd frontend
pnpm install

# 3. Inicie o servidor do Expo em modo Web
pnpm web
```

Após o comando `pnpm web`, o navegador abrirá automaticamente em **`http://localhost:8081`** (ou pressione a tecla `w` no terminal do Expo).

> [!NOTE]
> Se quiser ver os dados reais consumindo as APIs de Pedidos e Relatórios, suba o backend em outro terminal a partir da raiz: `pnpm db` e `pnpm backend`. Para apenas avaliar as interfaces e protótipos, rodar só o front é suficiente.

---

## 3. Páginas Acessíveis pelo Menu Lateral (Sidebar)

Estas telas já estão integradas à navegação do painel principal e podem ser acessadas clicando diretamente nos itens da barra à esquerda:

| Página | Rota | Descrição |
| :--- | :--- | :--- |
| **Pedidos** | `/` | Dashboard principal de pedidos em tempo real |
| **Estoque** | `/estoque` | Gestão de produtos, quantidades e sincronização |
| **Relatórios** | `/relatorios` | Gráficos e métricas de vendas e faturamento |
| **Rotas** | `/rotas` | Gestão de entregas, paradas e entregadores próprios |
| **Configurações** | `/configuracoes` | Abas de Estabelecimento, Usuários, Integrações e Preferências |

---

## 4. ⚠️ Páginas Acessíveis Apenas via URL

> [!WARNING]
> Como os fluxos completos de autenticação (guard de rota, botão de "Sair/Logout" e redirecionamentos) ainda estão em fase de integração com o backend, **as telas de acesso não possuem links diretos no menu**.
> 
> Para visualizá-las e testá-las, digite o endereço correspondente diretamente na barra de URL do seu navegador:

| Tela | URL direta no navegador | Descrição |
| :--- | :--- | :--- |
| **Login** | [`http://localhost:8081/login`](http://localhost:8081/login) | Tela de login com e-mail, senha e "Lembrar dispositivo" |
| **Cadastro** | [`http://localhost:8081/cadastro`](http://localhost:8081/cadastro) | Cadastro do estabelecimento e dados do responsável |
| **Recuperação de Senha** | [`http://localhost:8081/recuperar-senha`](http://localhost:8081/recuperar-senha) | Formulário de solicitação de e-mail de recuperação |
| **Redefinição de Senha** | [`http://localhost:8081/redefinir-senha`](http://localhost:8081/redefinir-senha) | Formulário com validação de nova senha e confirmação |

---

## 5. Dicas Úteis

- **Recarregar alterações:** o Expo possui *Fast Refresh*, mas se precisar recarregar manualmente a tela, pressione `r` no terminal do Expo ou `F5`/`Ctrl+R` no navegador.
- **Limpar cache se algo não carregar:**
  ```bash
  npx expo start --web -c
  ```
- **Troca de tema (Claro / Escuro):** o app respeita automaticamente a preferência do seu sistema operacional/navegador.

