import * as cdk from 'aws-cdk-lib/core';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { InfraStack } from '../lib/infra-stack';

describe('InfraStack — catalogo', () => {
  const app = new cdk.App();
  const stack = new InfraStack(app, 'TestStack');
  const template = Template.fromStack(stack);

  test('cria a tabela Products com id numerico como chave', () => {
    template.resourceCountIs('AWS::DynamoDB::GlobalTable', 2);
    template.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'N' }],
      KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
    });
  });

  test('registra as duas rotas de leitura do catalogo', () => {
    template.resourcePropertiesCountIs(
      'AWS::ApiGatewayV2::Route',
      { RouteKey: 'GET /api/products' },
      1,
    );
    template.resourcePropertiesCountIs(
      'AWS::ApiGatewayV2::Route',
      { RouteKey: 'GET /api/products/{id}' },
      1,
    );
  });

  test('habilita CORS para o GitHub Pages', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      CorsConfiguration: Match.objectLike({
        AllowOrigins: ['https://alisuco.github.io'],
      }),
    });
  });

  test('semeia a tabela com o catalogo do products.json como JSON string', () => {
    template.hasResourceProperties('AWS::CloudFormation::CustomResource', {
      TableName: Match.anyValue(),
      Products: Match.stringLikeRegexp('Cyberpunk 2077: Phantom Liberty'),
    });
  });

  test('expõe a URL da API como Output', () => {
    template.hasOutput('ProductsApiUrl', {
      Value: Match.anyValue(),
      Description: 'URL da API de produtos (copiar para assets/js/config.js)',
    });
  });
});

describe('InfraStack — pedidos', () => {
  const app = new cdk.App();
  const stack = new InfraStack(app, 'OrdersTestStack');
  const template = Template.fromStack(stack);

  test('cria a tabela Orders com orderId como chave', () => {
    template.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      AttributeDefinitions: [{ AttributeName: 'orderId', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'orderId', KeyType: 'HASH' }],
      BillingMode: 'PAY_PER_REQUEST',
    });
  });

  test('registra as rotas de criacao e consulta de pedidos', () => {
    template.resourcePropertiesCountIs(
      'AWS::ApiGatewayV2::Route',
      { RouteKey: 'POST /api/orders' },
      1,
    );
    template.resourcePropertiesCountIs(
      'AWS::ApiGatewayV2::Route',
      { RouteKey: 'GET /api/orders/{orderId}' },
      1,
    );
  });

  test('concede permissao para publicar no EventBridge', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({ Action: 'events:PutEvents' }),
        ]),
      }),
    });
  });
});

describe('InfraStack — processador', () => {
  const app = new cdk.App();
  const stack = new InfraStack(app, 'ProcessorTestStack');
  const template = Template.fromStack(stack);

  test('cria regra que filtra OrderCreated', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      EventPattern: {
        source: ['cube.orders'],
        'detail-type': ['OrderCreated'],
      },
    });
  });

  test('concede permissao para enviar e-mail pelo SES', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({ Action: 'ses:SendEmail' }),
        ]),
      }),
    });
  });
});
