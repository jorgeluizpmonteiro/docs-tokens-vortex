# Tokens do Laboratório

Governança de design tokens com IA para o laboratório Vórtex (UNIFOR). São dois fluxos no n8n e um plugin do Figma que trabalham juntos:

- **Personalizar projeto:** o designer responde 13 perguntas no plugin. O n8n confere as respostas em código contra a documentação do laboratório, a IA monta a proposta, o código audita a proposta e o plugin mostra uma prévia visual. Com um clique, o plugin aplica tudo no arquivo.
- **Validar token específico:** quem propõe um token novo envia pelo plugin. O n8n roda 12 checagens em código, a IA dá um parecer, a lead decide num e-mail com formulário, e quem propôs recebe o resultado com os próximos passos.

O princípio dos dois fluxos: **regra exata fica no código, julgamento fica com a IA, a decisão fica com uma pessoa, e tudo é medido.**

## O que tem aqui

```
n8n/
  01-personalizar-projeto.json      fluxo 1: recebe as respostas, propõe e audita
  02-entregar-plano.json            entrega a proposta ao plugin e registra a decisão
  03-validar-token-especifico.json  fluxo 2: checagens, parecer, e-mail da lead e retorno
plugin/
  manifest.json, code.js, ui.html   plugin do Figma que lê e escreve as variáveis
```

## Como funciona

### Fluxo 1: personalizar projeto

1. O plugin lê as variáveis do arquivo (Base, Semântica e Específicos, nos modos claro e escuro) e envia junto com as respostas do questionário.
2. **Conferir respostas** (código) calcula o que é exato: trocas de cor e fonte na Base, grupos opcionais a apagar, alertas e uma pré-checagem de contraste.
3. **Proposta** (IA) sugere só as trocas de referência da Semântica, seguindo a documentação.
4. **Auditar proposta** (código) reprova o que viola regra: token inexistente, referência fora da Base, limites do Ajustável, altura de linha e escala de espaços.
5. **Montar ficha** grava o plano na tabela `registro_personalizacao`.
6. O plugin busca o plano no fluxo **entregar plano**, mostra a prévia (inclui um card de componente antes e depois, nos dois modos) e, se o designer aplicar, faz tudo no arquivo de uma vez e mede o contraste de novo. A decisão volta para a tabela.

### Fluxo 2: validar token específico

1. O plugin envia a variável criada na coleção `specific` e o motivo do pedido.
2. **Conferir regras** (código) roda as checagens R-01 a R-12: formato do nome, vocabulário, nome do projeto, aparência ou componente no nome, repetição da Semântica, referências para a Base, contraste, escopo, seis rótulos da descrição, situação e linha Valor.
3. **Parecer** (IA) responde às perguntas da documentação: algum token resolve? É só deste projeto? Já apareceu em 3 ou mais projetos?
4. **Montar e-mail** envia à lead um e-mail com veredito, o que fazer, falhas, alertas e o parecer.
5. A lead decide num formulário do n8n (**Esperar decisão**) e pode deixar um recado.
6. O registro vai para a tabela `registro_propostas`, e **Montar retorno** manda a quem propôs o resultado e os próximos passos.

## Como importar

1. No n8n, crie as Data Tables `registro_personalizacao` e `registro_propostas` com as colunas que aparecem nos nós **Data table**.
2. Importe os três JSONs da pasta `n8n` (menu do workflow → Import from File).
3. Em cada nó marcado com `SUA_CREDENCIAL`, conecte a sua credencial: Google Drive, Gmail e Gemini (Google AI Studio).
4. Troque os marcadores:
   - `ID_DO_ARQUIVO_MD`: link do .md da documentação no Google Drive (nó **Ler documentação**);
   - `ID_DA_TABELA`: escolha a tabela certa em cada nó de Data Table;
   - `EMAIL_DA_LEAD@exemplo.com`: e-mail de quem aprova (nó **Aprovação**).
5. Publique os três workflows.
6. No Figma desktop: Plugins → Development → Import plugin from manifest, e escolha `plugin/manifest.json`. Abra o plugin e cole os endereços dos webhooks em "Endereços do n8n".

## Resultados dos testes (01 e 02/11/2026)

Testes feitos em duplicados do arquivo do laboratório, por uma pessoa nos dois papéis.

- **Personalização (Projeto D):** um clique aplicou 13 trocas na Base e 15 na Semântica, e removeu 107 variáveis opcionais. Foram 2 minutos de automação e 5 de revisão na prévia.
- **Validação:** em 6 propostas, a recomendação da IA bateu com a decisão humana em todas. Uma proposta com 7 falhas foi barrada antes de chegar ao arquivo.

## Ferramentas

n8n (webhooks, nós de código em JavaScript, Data Tables, Gmail, Google Drive, espera por formulário), API do Gemini e Plugin API do Figma.

Autor: Jorge Luiz Pereira Monteiro.
