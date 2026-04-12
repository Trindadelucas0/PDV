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
   - Desenvolvimento (watch): `npm run build:css`
   - Build único (produção / VPS): `npm run build:css:once`
4. Em outro terminal, inicie o servidor:
   - `npm run dev`

## Deploy (VPS / produção)

1. **Código e dependências:** `git pull` (ou cópia dos arquivos), depois `npm install` se mudou o `package.json`.
2. **CSS:** na pasta do projeto rode `npm run build:css:once` e envie/commit o arquivo gerado `src/public/css/styles.css` (o Tailwind lê `src/public/css/input.css` e escreve o bundle).
3. **Cache do navegador:** no `.env` defina `ASSET_VERSION` (ex.: `1`, depois `2`…) a cada deploy que alterar CSS ou assets estáticos. O layout carrega `styles.css?v=…` com essa versão para forçar download novo.
4. **Banco de dados:** não existe comando separado de migração. Ao **subir o Node**, o `initDb` roda automaticamente (`CREATE TABLE IF NOT EXISTS`, colunas, índices, tabela `venda_recebimentos` e backfill idempotente). Basta `.env` com conexão ao PostgreSQL correta e **reiniciar** o processo (PM2, systemd, etc.).
5. **Reinício:** reinicie a aplicação após deploy. Se algo falhar no schema, veja o log na subida do servidor.

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
