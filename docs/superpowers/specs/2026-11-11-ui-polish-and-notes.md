# UI polish + notas por intervalo

Data: 2026-11-11. Pedido do usuário depois de testar a versão instalada (screenshots do onboarding).

## 1. Foco do campo cortado (onboarding, passo Projetos)
O anel de foco do campo "Cliente" é cortado à esquerda: o container com `overflow-auto` (OnboardingApp.tsx:62 e/ou o wrapper do passo) corta o `outline`/borda que fica fora da caixa do input.
Correção: o foco não pode ser cortado em nenhum campo de nenhuma janela. Use anel de foco interno (`ring-inset` / borda que não ultrapassa a caixa) nos `input.txt` do app, ou dê padding lateral ao container rolável. Verifique também Settings (Projetos) e o notch (busca/criar).

## 2. Editor de jornada quebrado (onboarding passo Jornada e Configurações → Jornada)
Os steppers de cada dia (− 8 +) são mais largos que o card do dia e "vazam" pra fora, ficando tortos e sobrepostos.
Correção: cada card de dia contém totalmente o seu stepper, todos com a mesma largura, alinhados numa grade regular (7 colunas que cabem na janela de 640 px do onboarding e na de 780 px das configurações, ou 4+3 linhas). Stepper compacto (botões 24–28 px, valor centralizado). Mesmo componente nos dois lugares (`JornadaEditor`).

## 3. Seletor de horário (TimePicker) feio e cortado pela janela
Hoje: popover alto com duas colunas grandes e botão OK grande; abre dentro da webview e é cortado pelas bordas arredondadas da janela.
Novo desenho, minimalista como o resto:
- O gatilho continua sendo a pílula `HH:MM`.
- Ao clicar, abre um popover pequeno (≈ 168 × 196 px no máximo) com duas colunas estreitas (hora 00–23, minuto em passos de 5 por padrão; prop `minuteStep`, 1 nos registros do relatório para precisão), itens de 28 px, texto 13 px, item selecionado com fundo `--accent` sutil (ou texto accent + fundo raise2), sem botão OK: escolher o minuto confirma e fecha; escolher a hora apenas marca. Enter confirma, Esc cancela, setas navegam, roda do mouse rola as colunas.
- Alternativa de digitação: o gatilho aceita digitar "1330"/"13:30" quando focado (opcional, se simples).
- O `Popover` deve sempre caber dentro da janela: posicionar com margem de 8 px das bordas, inverter para cima quando não couber embaixo, e reduzir a altura (`max-height` = espaço disponível) quando nem assim couber. Vale para todos os popovers (Dropdown, Calendar, ColorPicker, Export).
- Estilo: fundo `#18181e`/token, borda `--line`, raio 12, sombra suave; sem azul saturado em blocos grandes.

## 4. Nota ao parar um intervalo
Quando o usuário encerra um bloco de trabalho, o app oferece um campo para anotar o que fez naquele período.
- **Quando aparece:** ao **Parar** e ao **Pausar** pelo notch (decisão do Claude: não ao trocar de projeto, para não interromper trocas rápidas; a nota de qualquer bloco pode ser editada depois na visão do dia).
- **Onde:** dentro do painel do notch, substituindo o conteúdo: título "O que você fez?" + subtítulo "Projeto · HH:MM–HH:MM (duração)", campo de texto de uma ou duas linhas (textarea estilizada, sem controles nativos visíveis), botões "Salvar" (primário) e "Pular". Enter salva (Shift+Enter quebra linha), Esc pula. O painel fica fixo e com foco de teclado enquanto o campo está aberto (é ação do usuário, então pode pegar foco: chamar `overlayFocus()`). Não aparece se o bloco tiver menos de 1 minuto.
- **Dados:** coluna nova `entries.note TEXT NULL` (migração v2 via `user_version`). `Entry.note: Option<String>`. Comando `set_entry_note(id, note: string | null)` (texto vazio/só espaços = null; máx. 500 caracteres). Pausar/parar retornam/permitem saber o id do bloco fechado (ex.: `TrackerSnapshot.lastClosedEntry: { id, projectId, start, end } | null` preenchido na operação), para o notch saber qual registro anotar.
- **Visão do dia (relatório):** cada linha de registro mostra a nota (texto secundário, uma linha com reticências) e um ícone/área para editar a nota (popover pequeno com o mesmo campo). Notas também podem ser adicionadas a blocos sem nota.
- **Exportação:** CSV detalhado ganha a coluna `nota` (escapada como os outros campos). HTML detalhado mostra a nota na tabela de registros (escapada). CSV resumido não muda.
- **Undo:** salvar nota não precisa de desfazer.

## Restrições
Todas as globais do projeto continuam: sem controles nativos, só azul/branco nos controles, textos pt-BR em `src/i18n/pt-BR.ts`, testes primeiro.
