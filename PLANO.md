# Plano de execução — Desafio 1

Documento de apoio para acompanhar o progresso. Ele não altera o projeto por si só.

Progresso: Etapa 1 concluída; próxima: Etapa 2.

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
- `frontend/data/products.json` existe, mas hoje não é buscado pelo `app.js`; servirá como semente do catálogo.
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

### Etapa 2 — CDK base: S3 + CloudFront
- Objetivo: publicar o `frontend/` e gerar a URL pública.
- Mudanças previstas: `infra/lib/infra-stack.ts`, possivelmente novos arquivos em `infra/lib/constructs/`.
- Verificação: `npm run build`, `npx cdk synth` e conferência dos recursos `AWS::S3::Bucket`, `AWS::CloudFront::Distribution` e do `Output` da URL.
- Deploy: separado, só com autorização.

### Etapa 3 — Catálogo
- Objetivo: criar a tabela `Products`, semear com `products.json` e expor as rotas de leitura.
- Mudanças previstas: tabela DynamoDB, Lambda de seed via custom resource, Lambda de produtos e rotas `GET /api/products` e `GET /api/products/{id}`.
- Verificação: `npm run build`, `npm test`, `npx cdk synth` e, após deploy, `Invoke-RestMethod https://<url>/api/products`.

### Etapa 4 — Pedidos
- Objetivo: criar a tabela `Orders`, implementar `POST /api/orders` e `GET /api/orders/{id}`.
- Mudanças previstas: Lambda de pedidos gravando `PENDING`, calculando preços no servidor e publicando evento; leitura de status por `orderId`.
- Verificação: `POST` de teste com `items: [1]`, depois `GET /api/orders/{orderId}` conferindo `PENDING`.

### Etapa 5 — Processador de eventos
- Objetivo: fechar o fluxo assíncrono orientado a eventos.
- Mudanças previstas: regra EventBridge -> Lambda Processor, geração de chaves, atualização do pedido para `COMPLETED` e envio via SES.
- Verificação: repetir o `POST` e acompanhar o `GET` até `COMPLETED`, conferindo `items[].key`.

### Etapa 6 — Integração total no CloudFront
- Objetivo: garantir que o front e a API funcionem sob a mesma URL pública.
- Mudanças previstas: behavior `/api/*` no CloudFront apontando para o API Gateway.
- Verificação: abrir a URL pública, navegar pelo catálogo, adicionar ao carrinho e finalizar checkout.

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
Etapa 2 — CDK base: S3 + CloudFront. Ainda depende da sua autorização antes de qualquer alteração.
