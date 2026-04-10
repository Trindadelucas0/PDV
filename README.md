# ControlePDV

Sistema completo de **Controle de Estoque + PDV + Caixa + Recibo** com Node.js, Express, EJS, TailwindCSS e PostgreSQL.

## Requisitos
- Node.js 18+
- PostgreSQL ativo

## Configuração
1. Instale dependências:
   - `npm install`
2. Configure o arquivo `.env` (credenciais do banco, login admin, `SESSION_SECRET`, dados da loja: `STORE_NAME`, `STORE_PHONE`, `STORE_ADDRESS` para o recibo).
3. Gere o CSS do Tailwind:
   - `npm run build:css`
4. Em outro terminal, inicie o servidor:
   - `npm run dev`

## Login
- Usuário e senha vêm do `.env`:
  - `ADMIN_USER`
  - `ADMIN_PASSWORD`

## Funcionalidades
- Login com sessão e proteção de rotas
- Dashboard com vendas/lucro do dia
- CRUD de produtos com alerta de estoque baixo
- Tela PDV com adição por código de barras
- Cadastro automático de cliente na venda
- Finalização com cálculo de total, lucro e troco
- Baixa automática de estoque com validação (sem venda sem estoque; lock em concorrência)
- Ajuste de estoque (entrada, perda, inventário) em **Ajuste de estoque** no menu
- PDV com atalhos F2/F4, toast e busca com tratamento de rede
- Cliente reutilizado quando CPF ou telefone já existem
- Recibo imprimível
- Histórico de vendas com filtro por data e detalhes
