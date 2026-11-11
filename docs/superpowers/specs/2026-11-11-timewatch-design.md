# Timewatch: design

Data: 2026-11-11
Status: rascunho para aprovação

Referência visual: o protótipo descartável aprovado em `.superpowers/brainstorm/48038-1794341281/content/prototipo-v2.html`. Ele é a referência de **comportamento e aparência**, não de código.

Convenção: itens marcados com **(decisão do Claude)** foram escolhas minhas que o autor não discutiu explicitamente; todo o resto foi decidido por ele.

---

## 1. Intenção

Consultores trabalham para vários clientes e projetos na mesma semana, em blocos de algumas horas, com reuniões e pedidos rápidos de outros clientes no meio. As trocas não deixam rastro, e no fim da semana a pessoa precisa reconstruir quanto tempo ficou em cada projeto (o autor faz isso "caçando nos chats") para lançar no sistema de timesheet da empresa.

O Timewatch resolve isso **no momento da troca**: um app de desktop que vive no notch (ou no topo central da tela), onde a pessoa diz em qual projeto está com um ou dois cliques. No fim da semana, as horas por projeto e cliente, com hora extra separada, estão prontas para copiar ou exportar.

## 2. Objetivos

- Trocar de projeto em 1 a 2 cliques ou poucas teclas, sem abrir janela e sem roubar o foco do que a pessoa está fazendo.
- Nunca perder horas: o relógio sobrevive a crash, reinício e repouso do sistema.
- Lidar com o esquecimento (sair com o relógio rodando) perguntando, nunca descontando sozinho.
- Relatório semanal pronto para lançar: horas decimais por projeto/cliente por dia, com arredondamento opcional e hora extra separada.
- Open source, para qualquer consultor. Cada pessoa configura os próprios clientes, projetos, jornada, almoço e arredondamento.
- macOS e Windows funcionando na primeira versão.

## 3. Não-objetivos (primeira versão)

- Sincronização, nuvem, contas, times, compartilhamento.
- Integração direta com sistemas de timesheet (o caminho é copiar/exportar).
- Importar feriados automaticamente.
- Faturamento, valor por hora, orçamentos de projeto.
- Linux.
- App de celular.

## 4. Anti-objetivos (o que faria o produto falhar mesmo "funcionando")

- Descontar tempo automaticamente sem perguntar (uma reunião por vídeo de 40 min sem tocar no teclado não pode sumir).
- Roubar o foco do teclado quando o notch abre por hover.
- Perder o tempo de uma sessão rodando por causa de crash, update ou reinício.
- Exigir abrir uma janela para trocar de projeto.
- Mandar qualquer dado para fora da máquina.

## 5. Restrições técnicas (decididas pelo autor)

Stack:
- Tauri 2, backend em Rust.
- Frontend React 19 + TypeScript, Vite, Tailwind CSS, Framer Motion, Zustand, pnpm.
- Código específico de plataforma isolado em `src-tauri/src/platform/{macos,windows}`. O frontend não conhece detalhes nativos.
- Uma única instância do app; roda continuamente em segundo plano.
- Não simular no frontend o que precisa de API nativa.

Estrutura sugerida (do documento técnico do autor):

```text
src/            app/ components/{notch,tray,settings,ui}/ hooks/ services/ stores/ styles/
src-tauri/src/  main.rs lib.rs commands/ platform/{mod.rs,macos/,windows/} tray/ window/
```

Interface visual: **nenhum elemento nativo de formulário** (select, checkbox, time/date picker, radio). Todos são componentes próprios: dropdown, seletor de horário em colunas (hora/minuto), calendário, toggle, stepper, controle segmentado, seletor de cor. Campos de texto podem ser `<input>` estilizados.

Cores: tema escuro. Botões e destaques **só em tons de azul e branco** (sem verde, amarelo ou vermelho em botões, toggles, chips ou estados). A única exceção são as cores que identificam cada projeto (pontos coloridos). Hora extra aparece em azul claro.

## 6. Conceitos e regras de negócio

### 6.1 Modelo de dados

- **Cliente** → tem vários **projetos**. Projeto tem nome, cliente, cor e pode ser arquivado (some das listas de troca, continua no histórico).
- **Registro (entry)**: projeto, início, fim (nulo enquanto roda). No máximo um registro rodando por vez.
- **Almoço do dia**: intervalo marcado pelo usuário a partir de uma ausência (no máximo um por dia).
- **Configurações** (seção 6.7).
- Tudo guardado em **SQLite local** no diretório de dados do app. Sem conta, sem rede **(decisão do Claude, sem objeção do autor)**.
- O tempo é sempre guardado exato (precisão de segundos). Arredondamento só afeta exibição e exportação.

### 6.2 Relógio: estados

- **Parado**: nenhuma sessão.
- **Rodando**: um registro aberto. A **sessão** é a sequência de blocos do mesmo projeto separados por pausas; o relógio grande mostra o tempo da sessão (soma dos blocos, sem as pausas).
- **Pausado**: o registro atual é fechado; a sessão continua lembrando o projeto. Retomar abre um novo registro no mesmo projeto e o relógio continua de onde parou.
- **Trocar de projeto** fecha o registro atual (se houver) e abre outro, iniciando nova sessão. Funciona a partir de rodando, pausado ou parado.
- **Parar** fecha o registro e encerra a sessão.
- O relógio roda no Rust, não no frontend. O início do registro é gravado no banco **no momento do clock in**.
- **Sinal de vida:** enquanto há registro rodando, o app grava no banco o horário atual a cada minuto (e no repouso, se o sistema avisar a tempo).
- **App fechado com o relógio rodando** (crash, reinício, desligamento): ao abrir de novo, se há registro aberto e o último sinal de vida está a mais de 2 minutos do momento atual, o registro é **fechado automaticamente no último sinal de vida**, sem perguntar, e a sessão termina. Um toast avisa: "O relógio foi parado às HH:MM, quando o app fechou" (com Desfazer, que reabre o registro como se nada tivesse acontecido). Se o intervalo for menor que 2 min (ex.: atualização do app), o registro continua normalmente **(limite de 2 min: decisão do Claude)**.
- **Sair** (menu da bandeja ou ⌘Q) para o relógio no momento da saída e encerra a sessão.

### 6.3 Ausência

- Detectada por (a) tempo sem teclado/mouse acima do limite configurado (padrão 15 min) e (b) repouso do sistema / tela travada.
- Só pergunta se havia um registro **rodando** (pausado ou parado não pergunta).
- O app anota o início da ausência (última atividade, ou o momento em que entrou em repouso). Quando a pessoa volta, o notch abre sozinho com a pergunta "Você ficou fora das HH:MM às HH:MM" e quatro opções:
  - **Descontar**: fecha o registro no início da ausência e abre um novo, no mesmo projeto, no momento da volta.
  - **Foi o almoço**: igual a descontar e marca o intervalo como almoço do dia.
  - **Manter**: nada muda.
  - **Mover para outro projeto**: o intervalo vira um registro do projeto escolhido (chips com os recentes); o projeto original continua no momento da volta.
- Todas as respostas podem ser desfeitas (toast com "Desfazer").
- Opção **Parar o relógio ao fechar o notebook** (padrão desligada): se ligada, ao entrar em repouso o relógio para no momento do repouso e não pergunta nada na volta.
- Limitação conhecida: o macOS não avisa "tampa fechada" diretamente; usamos a notificação de repouso. Com monitor externo o Mac não entra em repouso, e a opção não dispara. Documentar.

### 6.4 Almoço

- Configuração: **duração** (padrão 60 min; 0 = não descontar) e **horário de referência** (padrão 12:00).
- Se o dia já terminou e nenhuma ausência foi marcada como almoço, desconta a duração do registro que estava rodando no horário de referência. Se nada rodava nesse horário, não desconta.
- O desconto é calculado, não grava nada: se a pessoa marcar um almoço depois, ou mudar a configuração, o cálculo muda.
- "Dia terminou" = o dia é anterior ao dia atual **(decisão do Claude)**.

### 6.5 Jornada e hora extra

- Jornada configurada **por dia da semana** (padrão seg–sex 8h, sáb–dom 0h). Jornada 0 = tudo trabalhado no dia é extra.
- **Feriados**: datas marcadas manualmente num calendário; ficam com jornada 0.
- Cálculo cronológico: depois do desconto do almoço, as horas do dia são somadas em ordem; o que passa da jornada é hora extra **do projeto que estava rodando** naquele momento.
- Registros que atravessam a meia-noite são divididos entre os dias.

### 6.6 Arredondamento

- Opções: exato, 15 min, 30 min (padrão exato).
- Aplicado por projeto, por dia, separadamente para horas normais e extras (arredondamento ao mais próximo) **(decisão do Claude)**.
- Horas exibidas em decimal com vírgula (ex.: 5,5).
- Todo total é **soma dos valores já arredondados** das células de projeto: valor do cliente no dia, linha "Total", coluna "Total", cartões e CSV. Assim os números da tela sempre fecham entre si e com o que a pessoa lança **(decisão do Claude)**.

### 6.7 Configurações

- Geral: arredondamento; iniciar junto com o sistema (padrão ligado); monitor da pílula (padrão: tela principal).
- Jornada e extras: jornada por dia (stepper de 0,5h, com presets "Seg–Sex 8h/6h/4h"); feriados.
- Almoço: duração (stepper de 15 min); horário de referência.
- Ausência: limite em minutos (stepper de 5); parar ao fechar o notebook.
- Projetos: adicionar (cliente + projeto), trocar cor, arquivar/desarquivar.
- Atalho global configurável **(decisão do Claude: padrão ⌥ Space no Mac, Alt+Space no Windows; precisa ser configurável porque Alt+Space é o menu de janela do Windows)**.

## 7. Interface

### 7.1 Notch fechado (pílula)

Pílula preta, sempre visível, no topo central:
- Rodando: ponto da cor do projeto, nome do projeto, tempo da sessão.
- Pausado: ícone de pausa, nome esmaecido, tempo congelado.
- Parado: "Sem projeto rodando".

No Mac com notch, a pílula se encaixa no notch. Em Mac sem notch, com monitor externo, ou no Windows, é a mesma pílula no topo central **(decisão do Claude: o documento técnico só previa isso para o Windows)**.

**Monitores:** existe uma pílula só, na tela principal do sistema (no Mac, a que tem a barra de menus; no Windows, o monitor principal). Ela se reposiciona quando a configuração de telas muda. Uma configuração permite escolher outro monitor.

**Telas sem notch (Windows e Mac sem notch):** fechada, a pílula vira uma faixa bem fina no topo central (poucos pixels de altura, ex. 6 px, mostrando só o ponto/cor do projeto ou uma linha) para quase não cobrir abas e barras de título de janelas maximizadas. Quando o mouse chega nela, cresce para a pílula normal e, se continuar em cima, abre o painel. Apenas a área visível captura cliques. No Mac com notch, a pílula normal fica sempre visível, porque ocupa o espaço do próprio notch.

### 7.2 Notch aberto

Abre ao passar o mouse; fecha ao sair (com pequeno atraso). Clicar fixa aberto; clicar fora fecha. Não rouba o foco ao abrir por hover; só pega o foco do teclado quando aberto pelo atalho global ou ao clicar no campo de busca. Animação de expansão estilo Dynamic Island (spring).

Conteúdo (opção "A" escolhida, com a busca do "B" incorporada):
- Cliente · projeto atual, chip "pausado" se for o caso, relógio grande da sessão.
- Botões redondos: pausar/retomar (retomar em branco) e parar.
- Barra de progresso do dia: parte normal em azul, parte extra em azul claro; "Hoje Xh Ym" e "jornada Nh".
- Campo "Trocar para… ou criar projeto". Digitar filtra; Enter troca para o primeiro resultado; a última linha oferece "Criar projeto “texto”".
- Sem busca: até 4 recentes, cada um com horas de hoje e atalho 1–4; linha "Todos os projetos" (lista agrupada por cliente).
- Criar projeto (no próprio notch): nome, cliente (chips dos existentes ou texto novo), cor; "Criar e iniciar".
- Rodapé: "Ver horas da semana" e "Configurações".
- Teclado com o notch aberto: 1–4 trocam, espaço pausa/retoma, Esc fecha.
- Modo pergunta de ausência (6.3) substitui o conteúdo até ser respondido.

### 7.3 Ícone na barra de menus / bandeja

Sempre presente. Mostra ícone + tempo da sessão (Mac) ou só o ícone (Windows). Clique alterna o notch. Menu de contexto: Abrir, Ver semana, Configurações, Sair.

### 7.4 Janela de horas (relatório)

Janela normal do sistema.

**Visão da semana** (tela principal):
- Navegação ‹ semana › e "Esta semana".
- Segmentado "Por projeto / Por cliente".
- Cartões: total trabalhado, jornada prevista, hora extra.
- Grade: linhas = projetos agrupados por cliente (ou clientes), colunas = Seg–Dom + Total. Célula mostra total do dia e, abaixo, "+x extra". Linhas "Total" e "Hora extra".
- **Clicar num número copia o valor** para colar no sistema de timesheet (toast "5,5 copiado").
- **Clicar no cabeçalho de um dia substitui o conteúdo pela visão do dia.**

**Visão do dia**:
- "‹ Semana", navegação ‹ dia ›, "+ Adicionar registro".
- Cartões: total, jornada (indica feriado), hora extra.
- Linha do tempo visual (blocos coloridos por projeto, almoço hachurado, marcador de agora).
- Lista de registros: início e fim (seletor de horário próprio), projeto (dropdown próprio), duração, apagar (com desfazer). Almoço marcado aparece como linha própria, desmarcável.
- Nota explicando o almoço do dia: descontado automaticamente (de qual projeto), pendente, ou nada a descontar.

**Exportar** (menu): CSV ou HTML, com opção "detalhar início e fim de cada registro".
- CSV: separador `;`, vírgula decimal, BOM UTF-8 (abre direto no Excel em português). Colunas resumidas: `data;cliente;projeto;horas_normais;horas_extras;horas_total`. Detalhado: `data;cliente;projeto;inicio;fim;horas`.
- HTML: documento único, tema claro, pronto para imprimir: título, período, cartões, grade, e tabela de registros se detalhado.
- Exporta a semana visível, respeitando o agrupamento e o arredondamento.

### 7.5 Configurações

Janela com menu lateral (Geral, Jornada e extras, Almoço, Ausência, Projetos), usando os componentes próprios.

### 7.6 Onboarding (primeiro uso)

Janela centralizada, 6 passos com indicador de progresso:
1. Boas-vindas com a pílula de exemplo. "Configurar (1 min)".
2. Projetos: cliente + projeto, Enter adiciona, chips dos clientes já digitados. Pelo menos um para continuar.
3. Jornada (mesmo editor das configurações).
4. Almoço: duração (segmentado: não descontar / 30 min / 1h / 1h30) e horário de referência.
5. Arredondamento com exemplo ("2h10 vira 2,25" com 15 min; "2h10 vira 2" com 30 min).
6. "Em qual projeto você está agora?": clicar inicia o relógio; ou "só explorar".
Depois, uma dica aponta para o notch: "Seu relógio mora aqui…".

O protótipo tem "pular com dados de exemplo"; no app real, **pular** apenas fecha o onboarding sem dados **(decisão do Claude)**.

### 7.7 Feedback

Toasts curtos para ações; "Desfazer" para parar, apagar registro, desmarcar almoço e respostas de ausência.

## 8. Plataforma

| Necessidade | macOS | Windows |
|---|---|---|
| Overlay sem roubar foco, acima das janelas, em todos os espaços e sobre apps em tela cheia | `NSPanel` não ativador, nível acima do menu, `canJoinAllSpaces` + `fullScreenAuxiliary` | janela sem borda, transparente, always-on-top, `WS_EX_NOACTIVATE` / `WS_EX_TOOLWINDOW` |
| Geometria do notch | `NSScreen.safeAreaInsets` / `auxiliaryTopLeftArea` | não há; topo central |
| Tempo sem input | `CGEventSourceSecondsSinceLastEventType` | `GetLastInputInfo` |
| Repouso / volta / tela travada | `NSWorkspace` will/didSleep, screens sleep, `com.apple.screenIsLocked` | `WM_POWERBROADCAST`, `WTS_SESSION_LOCK/UNLOCK` |
| Mudança de monitores | `NSApplicationDidChangeScreenParametersNotification` | `WM_DISPLAYCHANGE` |
| Bandeja | ícone na barra de menus | ícone na system tray |
| Atalho global | plugin global-shortcut do Tauri | idem |
| Iniciar com o sistema | plugin autostart | idem |
| Instância única | plugin single-instance | idem |

Hover do notch sem foco: a janela da pílula precisa receber eventos de mouse sem ativar o app. O painel aberto cresce a partir da pílula.

## 9. Distribuição

Open source no GitHub. Builds de release para macOS (universal) e Windows via CI. Assinatura e notarização ficam **fora da primeira versão**: distribuir sem assinatura, com instruções de instalação (e, se der, Homebrew cask) **(decisão do Claude; custo de US$ 99/ano da Apple foi mencionado e não decidido)**.

## 10. Deixado para quem constrói

- Nome do app, ícones, licença.
- Esquema exato do SQLite e migrações.
- Divisão de responsabilidades entre comandos Tauri e eventos.
- Biblioteca de testes; estratégia de testes das regras de negócio (6.2–6.6) em Rust, que devem ter cobertura forte.
- Detalhes de animação e espaçamento, seguindo o protótipo.
- Idioma: interface em português na primeira versão; estruturar textos para tradução futura **(decisão do Claude)**.
