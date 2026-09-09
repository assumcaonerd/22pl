# Rádio 22PL

Núcleo inicial de uma rádio virtual automatizada de notícias.

## Recursos implementados

- programação contínua baseada em uma fila editorial;
- dois locutores virtuais alternados;
- identificação da fonte em cada boletim;
- prioridade automática para plantões;
- histórico para ouvir novamente;
- painel para criar, aprovar, bloquear e priorizar notícias;
- API própria para a emissora e para futuras integrações;
- interface responsiva para computador e celular.

## Executar

Requer Node.js 20 ou mais recente.

```bash
npm start
```

A rádio fica em `http://localhost:3000` e o painel editorial em `http://localhost:3000/admin.html`.

## Estrutura prevista

O núcleo web será conectado a um serviço de geração de áudio, servidor Icecast ou equivalente, banco persistente, ingestão do RSS do Notícia ES e aplicativos móveis. A API atual foi organizada para servir a essas etapas sem misturar o código com o portal de notícias.
