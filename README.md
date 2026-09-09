# Rádio 22PL

Rádio virtual automatizada com coleta contínua de notícias publicadas na internet.

## Recursos implementados

- programação contínua baseada em uma fila editorial;
- dois locutores virtuais alternados;
- identificação da fonte em cada boletim;
- prioridade automática para plantões;
- histórico para ouvir novamente;
- painel para criar, aprovar, bloquear e priorizar notícias;
- API própria para a emissora e para futuras integrações;
- coleta automática de múltiplos feeds jornalísticos a cada três minutos;
- deduplicação, identificação da fonte e prioridade para notícias urgentes;
- interface responsiva para computador e celular.

## Executar

Requer Node.js 20 ou mais recente.

```bash
npm start
```

A rádio fica em `http://localhost:3000` e o painel editorial em `http://localhost:3000/admin.html`.

Ao iniciar, o coletor consulta as fontes habilitadas em `config/sources.json`. Novas matérias entram na fila com o nome do veículo, o endereço original e o horário de publicação. O arquivo pode receber outros feeds RSS ou Atom sem mudança no servidor.

## Estrutura prevista

O núcleo web será conectado a um serviço de geração de áudio, servidor Icecast ou equivalente, banco persistente e aplicativos móveis. A API atual foi organizada para servir a essas etapas sem ligação editorial com o portal Notícia ES.
