# Plano de execução — Desafio 1

Documento de apoio para acompanhar o progresso. Ele não altera o projeto por si só.

Progresso: Etapas 1 a 6 concluídas; próxima: Etapa 7 (deploy).

## Regra de trabalho
- Nenhum arquivo é alterado e nenhum deploy é feito sem sua autorização explícita.
- Antes de cada etapa: descrevo o que será mudado, você aprova, eu executo e depois validamos.
- Sempre que fizer sentido, a etapa termina com `npm run build`, `npm test` e `npx cdk synth`, sempre de dentro de `infra/`.
- `npx cdk deploy` só depois de pedir autorização específica, porque muda uma conta AWS real.

## Contexto atual (verificado)
- `frontend/` é estático, sem build, sem gerenciador de pacotes.
- `infra/` é o único projeto npm (AWS CDK em TypeScript) e a stack ainda está vazia.
- `frontend/assets/js/app.js` já consome `GET /api/products`, `GET /api/products/:id`, `POST /api/orders` e `GET /api/orders/:id`.
- O carrinho fica em `localStorage['cube_keys_cart']`; o checkout envia só IDs de produtos e espera que o servidor calcule preços e chaves.
- `frontend/data/products.json` (20 produtos) é publicado no S3 e lido pela Lambda de seed para popular a tabela `Products`; o `app.js` não lê mais esse arquivo diretamente.
- `frontend/assets/video/video-explicativo.mp4` (~36 MB) está excluído do asset publicado, por decisão do usuário; o `BucketDeployment` usa `exclude: ['assets/video/**']`.
- O `README.md` da raiz descreve a arquitetura-alvo; ainda não há backend, URL pública nem deploy.

## Arquitetura alvo

```text
Navegador
   |
CloudFront (URL pública)
   ├── /         -> S3 privado via OAC (frontend/)
   └── /api/*    -> API Gateway HTTP
                      ├── GET  /api/products
                      ├── GET  /api/products/{id}
                      ├── POST /api/orders
                      └── GET  /api/orders/{id}
                               |
                          Lambdas
                               |
                     DynamoDB Products / Orders

POST /api/orders -> grava PENDING -> publica evento no EventBridge
EventBridge -> Lambda Processor -> gera chaves -> atualiza Orders -> SES
```

## Decisões padrão (sujeitas à sua revisão)
- API Gateway HTTP, não REST API; `/api` fica na mesma origem do CloudFront, então CORS não é necessário.
- EventBridge acionando a Lambda Processor para o fluxo orientado a eventos.
- Seed automático de produtos no deploy, reaproveitando `frontend/data/products.json`.
- Sem domínio customizado: usar o domínio `.cloudfront.net` como URL pública.
- SES com e-mail verificado; se não houver e-mail verificado no sandbox, desativar o envio real e deixar as chaves disponíveis no `GET /api/orders/:id`.
- Não pretendo alterar `app.js`; mudanças ficam em `infra/` e documentação, salvo necessidade de ajuste de caminho.

## Etapas

### Etapa 0 — Revisão do plano (concluída)
- Nenhuma alteração.
- Você revisa este `PLANO.md` e confirma os defaults ou pede ajustes.

### Etapa 1 — README + diagrama (concluída)
- Objetivo: transformar as decisões acima em documentação legível para o entregável final.
- Mudanças realizadas: `README.md` preenchido com diagrama Mermaid e `PLANO.md` atualizado.
- Verificação: leitura final; nenhum comando obrigatório.

### Etapa 2 — CDK base: S3 + CloudFront (concluída)
- Objetivo: publicar o `frontend/` e gerar a URL pública.
- Mudanças realizadas: `infra/lib/infra-stack.ts` agora cria um bucket S3 privado (`BLOCK_ALL`, SSE-S3), faz o upload do `frontend/` com `BucketDeployment` (sem o vídeo), cria o OAC via `S3BucketOrigin.withOriginAccessControl()` e a `Distribution` com `defaultRootObject: 'index.html'` e redirect para HTTPS. O `Output` `CloudFrontUrl` expõe a URL.
- Testes: `infra/test/infra.test.ts` trocou o placeholder SQS por 3 assertions reais (bucket privado, OAC + distribution, Output da URL).
- Verificação: `npm run build`, `npm test` (3 testes passando) e `npx cdk synth` (template com S3, OAC, CloudFront e Output). O asset synthetizado contém 8 arquivos do front e nenhum vídeo.
- Deploy: separado, só com autorização.

### Etapa 3 — Catálogo (concluída)
- Objetivo: criar a tabela `Products`, semear com `products.json` e expor as rotas de leitura.
- Mudanças realizadas: `TableV2` `Products` (chave `id` numérica, on-demand), Lambda `ProductsFunction` (handlers em `infra/lib/lambdas/products/`), HTTP API com `GET /api/products` e `GET /api/products/{id}` (uniform resource path, prefixo `/api` já incluído para o CloudFront da Etapa 6), e seed via `cr.Provider` + `CustomResource` cujo handler (`infra/lib/lambdas/seed/`) lê `data/products.json` do bucket e faz `BatchWriteItem`. O seed depende do `BucketDeployment`.
- Exceções de `.gitignore`: `infra/lib/lambdas/**/*.js` (raiz e `infra/`) para versionar os handlers JS.
- Verificação: `npm run build`, `npm test` (7 testes passando) e `npx cdk synth` (tabela `AWS::DynamoDB::GlobalTable`, `AWS::ApiGatewayV2::Api` com 2 rotas, Output `ProductsApiUrl`). Após deploy: validar com `Invoke-RestMethod https://<api-url>/api/products`.
- Deploy: separado, só com autorização.

### Etapa 4 — Pedidos (concluída)
- Objetivo: criar a tabela `Orders`, implementar `POST /api/orders` e `GET /api/orders/{id}`.
- Mudanças realizadas: `TableV2` `Orders` (chave `orderId` string/UUID), Lambda `OrdersFunction` (`infra/lib/lambdas/orders/`), rotas `POST /api/orders` e `GET /api/orders/{orderId}`. O `POST` valida os IDs, busca preços na tabela `Products` (`discountPrice || price`), grava `PENDING` com `ConditionExpression` e publica `OrderCreated` no barramento padrão do EventBridge. O `GET` devolve o pedido completo para o polling do front.
- Verificação: `npm run build`, `npm test` (10 testes passando) e `npx cdk synth` (4 rotas no API Gateway, 2 tabelas, permissão `events:PutEvents`). Após deploy: `POST` com `items: [1]` e `GET` conferindo `PENDING`.
- Nota: sem a Etapa 5 não há consumidor do evento, então o pedido permanece `PENDING` — comportamento esperado nesta etapa.
- Deploy: separado, só com autorização.

### Etapa 5 — Processador de eventos (concluída)
- Objetivo: fechar o fluxo assíncrono orientado a eventos.
- Mudanças realizadas: regra `OrderCreatedRule` (source `cube.orders`, detail-type `OrderCreated`) -> Lambda `ProcessorFunction` (`infra/lib/lambdas/processor/`). O handler gera chaves `XXXXX-XXXXX-XXXXX`, atualiza o pedido para `COMPLETED` e envia por SES **somente se** `CUBE_SENDER_EMAIL` estiver definido. As chaves são gravadas no DynamoDB antes do e-mail, para que o `GET` já as devolva mesmo se o SES falhar. `retryAttempts: 2` na regra.
- Verificação: `npm run build`, `npm test` (12 testes passando) e `npx cdk synth` (regra com `detail-type`, permissão `ses:SendEmail`). Após deploy: repetir o `POST` e acompanhar o `GET` até `COMPLETED`, conferindo `items[].key`.
- Nota: se não houver remetente verificado no SES (conta em sandbox), basta não definir `CUBE_SENDER_EMAIL`; o envio é desativado e as chaves ficam disponíveis na API.
- Deploy: separado, só com autorização.

### Etapa 6 — Integração total no CloudFront (concluída)
- Objetivo: garantir que o front e a API funcionem sob a mesma URL pública.
- Mudanças realizadas: `distribution.addBehavior('/api/*', ...)` com `HttpOrigin` a partir de `httpApi.apiEndpoint`, `AllowedMethods.ALLOW_ALL` (necessário para o `POST`), `CachePolicy.CACHING_DISABLED` e `OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER`. Como as rotas da API já usam o prefixo `/api`, o caminho chega intacto ao API Gateway.
- Verificação: `npm run build`, `npm test` (13 testes passando) e `npx cdk synth` (CacheBehaviors com `PathPattern: /api/*`, 7 métodos, cache policy `CachingDisabled`). Após deploy: abrir a URL pública, navegar pelo catálogo, adicionar ao carrinho e finalizar checkout.
- Deploy: separado, só com autorização.

### Etapa 7 — Deploy e validação final
- Objetivo: publicar a versão final e conferir os quatro entregáveis.
- Comandos: `npm run build`, `npm test`, `npx cdk synth`, `npx cdk diff`, `npx cdk deploy` (com autorização).
- Verificação final: URL abre, catálogo carrega, pedido completa, chaves aparecem, README e diagrama fazem sentido.

## Checklist final do desafio
- [ ] Repositório GitHub com o código-fonte.
- [ ] URL pública da loja funcionando.
- [ ] Diagrama de arquitetura claro.
- [ ] README com compreensão do projeto, arquitetura e instruções de execução/implantação.
- [ ] Links acessíveis e checkout validado na URL informada.

## Próximo passo sugerido
Etapa 7 — Deploy e validação final: `npm run build`, `npm test`, `npx cdk synth`, `npx cdk diff` e, **somente com autorização explícita**, `npx cdk deploy`. Depois validar a URL pública, o catálogo, o checkout e as chaves.
