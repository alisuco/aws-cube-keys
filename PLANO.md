# Plano de execução — Desafio 1

Documento de apoio para acompanhar o progresso. Ele não altera o projeto por si só.

Progresso: Etapas 1 a 7 concluídas. Deploy AWS e publicação no GitHub Pages finalizados; checkout validado de ponta a ponta com chaves geradas.

## Regra de trabalho
- Nenhum arquivo é alterado e nenhum deploy é feito sem sua autorização explícita.
- Antes de cada etapa: descrevo o que será mudado, você aprova, eu executo e depois validamos.
- Sempre que fizer sentido, a etapa termina com `npm run build`, `npm test` e `npx cdk synth`, sempre de dentro de `infra/`.
- `npx cdk deploy` só depois de pedir autorização específica, porque muda uma conta AWS real.

## Contexto atual (verificado)
- `frontend/` é estático, sem build, sem gerenciador de pacotes; será publicado no GitHub Pages.
- `infra/` é o único projeto npm (AWS CDK em TypeScript).
- `frontend/assets/js/app.js` consome `GET /api/products`, `GET /api/products/:id`, `POST /api/orders` e `GET /api/orders/:id`, montando a URL a partir de `frontend/assets/js/config.js`.
- O carrinho fica em `localStorage['cube_keys_cart']`; o checkout envia só IDs de produtos e espera que o servidor calcule preços e chaves.
- `frontend/data/products.json` (20 produtos) é lido no `cdk synth` e passado ao `CustomResource` de seed, que grava no DynamoDB.
- `frontend/assets/video/video-explicativo.mp4` (~36 MB) **está no repositório** desde o primeiro commit. Com GitHub Pages, ele fica acessível publicamente em `assets/video/video-explicativo.mp4` — decisão do usuário: manter o vídeo publicado.
- O deploy inicial com CloudFront/OAC falhou: uma SCP da Organizations (`p-cwpx03lm`) nega `cloudfront:CreateOriginAccessControl`. A migração para GitHub Pages removeu S3/CloudFront/OAC do stack, contornando esse bloqueio.
- O deploy atual terminou em `CREATE_COMPLETE` (37 recursos). Output: `https://c6v6pgmlu0.execute-api.us-east-1.amazonaws.com/api/products`. O catálogo tem 20 itens no DynamoDB e o CORS responde para `https://alisuco.github.io`.

## Arquitetura alvo

```text
Navegador
   |
GitHub Pages (alisuco.github.io/aws-cube-keys)
   |  CORS: GET, POST, content-type
   v
API Gateway HTTP
   ├── GET  /api/products
   ├── GET  /api/products/{id}
   ├── POST /api/orders
   └── GET  /api/orders/{orderId}
            |
       Lambdas
            |
    DynamoDB Products / Orders

POST /api/orders -> grava PENDING -> publica OrderCreated no EventBridge
EventBridge -> Lambda Processor -> gera chaves -> atualiza Orders -> SES (opcional)
```

## Decisões padrão (sujeitas à sua revisão)
- Front no **GitHub Pages**; URL pública: `https://alisuco.github.io/aws-cube-keys/`.
- A URL da API fica em `frontend/assets/js/config.js` (`window.CUBE_API_BASE_URL`) e é pública por natureza — não é segredo.
- Como são origens diferentes, o HTTP API habilita **CORS** para `https://alisuco.github.io`.
- API Gateway HTTP, não REST API.
- EventBridge acionando a Lambda Processor para o fluxo orientado a eventos.
- Seed automático de produtos no deploy, reaproveitando `frontend/data/products.json` embutido no template.
- SES com e-mail verificado; se não houver remetente verificado no sandbox, desativar o envio real e deixar as chaves disponíveis no `GET /api/orders/{orderId}`.
- Sem CloudFront, S3, OAC, domínio customizado nem behavior `/api/*`.

## Etapas

### Etapa 0 — Revisão do plano (concluída)
- Nenhuma alteração.

### Etapa 1 — README + diagrama (concluída)
- Objetivo: transformar as decisões em documentação legível para o entregável final.
- Mudanças: `README.md` preenchido com diagrama Mermaid e `PLANO.md` atualizado.

### Etapa 2 — CDK base: S3 + CloudFront (substituída)
- Foi implementada com bucket privado, `BucketDeployment`, OAC e Distribution.
- O deploy falhou por SCP explícita negando `cloudfront:CreateOriginAccessControl`.
- Com a migração para GitHub Pages, S3/CloudFront/OAC foram **removidos do stack**. Esta etapa não se aplica mais.

### Etapa 3 — Catálogo (concluída e ajustada)
- Objetivo: criar a tabela `Products`, semear com `products.json` e expor as rotas de leitura.
- Mudanças: `TableV2` `Products` (chave `id` numérica, on-demand), Lambda `ProductsFunction` (`infra/lib/lambdas/products/`) e rotas `GET /api/products` e `GET /api/products/{id}`.
- Ajuste após a migração: o seed (`infra/lib/lambdas/seed/`) não lê mais do S3 — recebe os 20 produtos via `ResourceProperties.Products`, lidos do JSON no `cdk synth`.
- Exceções de `.gitignore`: `infra/lib/lambdas/**/*.js` para versionar os handlers JS.

### Etapa 4 — Pedidos (concluída)
- Objetivo: criar a tabela `Orders`, implementar `POST /api/orders` e `GET /api/orders/{id}`.
- Mudanças: `TableV2` `Orders` (chave `orderId` string/UUID), Lambda `OrdersFunction` (`infra/lib/lambdas/orders/`), rotas `POST /api/orders` e `GET /api/orders/{orderId}`. O `POST` valida IDs, busca preços no DynamoDB (`discountPrice || price`), grava `PENDING` com `ConditionExpression` e publica `OrderCreated` no barramento padrão.

### Etapa 5 — Processador de eventos (concluída)
- Objetivo: fechar o fluxo assíncrono orientado a eventos.
- Mudanças: regra `OrderCreatedRule` (source `cube.orders`, detail-type `OrderCreated`) -> Lambda `ProcessorFunction` (`infra/lib/lambdas/processor/`). Gera chaves `XXXXX-XXXXX-XXXXX`, atualiza o pedido para `COMPLETED` e envia por SES somente se `CUBE_SENDER_EMAIL` estiver definido. As chaves são gravadas antes do e-mail, para o `GET` já devolvê-las se o SES falhar.

### Etapa 6 — Integração front/API (substituída)
- Antes: behavior `/api/*` no CloudFront com mesma origem.
- Agora: CORS no HTTP API para o domínio do GitHub Pages e URL da API configurada em `frontend/assets/js/config.js`.

### Etapa 7 — Deploy e validação final (concluída)
- Objetivo: publicar a versão final e conferir os entregáveis.
- Comandos executados: `npm run build`, `npm test`, `npx cdk synth`, `npx cdk diff`, `npx cdk deploy` (pelo usuario, no terminal dele).
- Resultado verificado: stack `CREATE_COMPLETE`, 37 recursos, 20 produtos no DynamoDB, rotas da API respondendo e CORS correto para o GitHub Pages.
- Correção aplicada após o segundo deploy: o `CustomResource` do CloudFormation entrega propriedades como string, então `Products` agora é enviado como `JSON.stringify(products)` e o handler converte `id` com `Number()` antes do `BatchWriteItem`. Isso evita `ValidationException: The provided key element does not match the schema` na tabela com chave numérica.
- Correção aplicada após a verificação do deploy: `items` é palavra reservada do DynamoDB e o `UpdateCommand` do processor falhava com `Invalid UpdateExpression`. O atributo agora usa o alias `#items` (commit `742f96d`), aplicado com `npx cdk deploy` em 26/11 as 22:53.
- `frontend/assets/js/config.js` preenchido com a URL do API Gateway.
- Publicacao do front: workflow `.github/workflows/deploy-pages.yml` (Source do Pages = GitHub Actions), executado com sucesso no commit `36a3a3a`.
- Validacao final: `npm run build`, `npm test` (10 testes), `npx cdk synth`, `npx cdk diff` (somente o codigo do ProcessorFunction) e `npx cdk deploy` (UPDATE_COMPLETE). Checkout de teste com `items: [1, 3]` chegou a `COMPLETED`, total R$ 315,30 e chaves `XXXXX-XXXXX-XXXXX` em `items[].key`.

## Checklist final do desafio
- [x] Repositório GitHub com o código-fonte.
- [x] URL pública da loja funcionando: `https://alisuco.github.io/aws-cube-keys/`.
- [x] Diagrama de arquitetura claro.
- [x] README com compreensão do projeto, arquitetura e instruções de execução/implantação.
- [x] Links acessíveis e checkout validado na URL informada.

## Próximo passo sugerido
Nenhum. Projeto concluído. Opcional: configurar remetente verificado no SES e definir `CUBE_SENDER_EMAIL` para habilitar o envio das chaves por e-mail (hoje desativado; as chaves ja estao disponiveis na API).
