# Arquitetura

Tauri 2 com backend em Rust e frontend em React 19 + TypeScript. Um único processo e uma única instância (`tauri-plugin-single-instance`). O frontend nunca chama APIs de plataforma: tudo passa por comandos Tauri.

## Mapa de módulos

Backend (`src-tauri/src`):

| Módulo | Responsabilidade |
| --- | --- |
| `lib.rs`, `main.rs` | Montagem do app, plugins, registro dos comandos, ciclo de vida (saída fecha a entrada em curso), emissão de `tracker://tick` |
| `domain/` | Tipos (`model.rs`), tempo e fuso (`time.rs`), cálculo de jornada, almoço, horas extras, relatórios (`calc.rs`). Puro, sem I/O |
| `store/` | SQLite via rusqlite: migrações (`db.rs`) e repositório (`repo.rs`) |
| `tracker/` | Máquina de estados do relógio (rodando, pausado, parado), trocas de projeto, ausências pendentes, validações de entradas, undo (`undo.rs`) |
| `absence.rs` | Detecção de ausência (inatividade e suspensão), thread de 5 s |
| `commands/` | Comandos Tauri, `AppState`, emissão de `tracker://changed` |
| `export/` | CSV e HTML (escapados) do relatório semanal |
| `i18n.rs` | Textos gerados no Rust em pt-BR, en e es (erros, avisos, bandeja, títulos de janela, exportações), detecção do idioma do sistema (`sys-locale`, só em `system_lang`) e formatos por idioma (decimal, separador do CSV). Tracker e exportações recebem o `Lang` resolvido |
| `tray/` | Ícone de bandeja, título/tooltip, atalho global, autostart |
| `window/` | Overlay (notch/faixa), janelas normais, polling de hover e de monitores |
| `platform/` | Fachada por SO. Código específico só em `platform/macos` e `platform/windows` |

Frontend (`src`): `views/` (Notch, Report, Settings, Onboarding, escolhidos pela janela), `components/{notch,report,settings,onboarding,ui}`, `stores/` (Zustand), `lib/` (`api.ts` é a única ponte para o Tauri, mais datas e formatação), `i18n/` (tabelas `pt-BR.ts`, `en.ts`, `es.ts` com as mesmas chaves, tipadas a partir do pt-BR; store `useLang`, `useT()` em componentes e `getT()` fora do React). Cada janela abre com `?lang=` e depois segue `get_language` e `settings://language`.

## Comandos

Estado e relógio: `get_snapshot`, `switch_project`, `pause_clock`, `resume_clock`, `stop_clock`, `resolve_absence`, `undo`.
Projetos: `create_project`, `update_project`, `project_usage`, `delete_project` (apaga o projeto e as entradas numa transação; recusado para o projeto da sessão; desfazível).
Relatórios e entradas: `get_week`, `get_day`, `add_entry`, `update_entry`, `delete_entry`, `set_entry_note`, `unmark_lunch`. `pause_clock` e `stop_clock` devolvem o bloco fechado (`ClosedEntry`), usado pelo notch para pedir a nota.
Configurações e exportação: `get_settings`, `set_settings`, `get_language` (idioma resolvido), `export_week`.
Janelas e overlay: `open_window`, `overlay_set_hit_rect`, `overlay_set_expanded`, `overlay_focus`, `get_overlay_config`.
Primeira execução: `finish_onboarding`, `skip_onboarding`.

## Eventos

- `tracker://changed` (payload: snapshot): qualquer mudança de estado; também atualiza a bandeja
- `tracker://tick` (`{ now }`): a cada segundo, para o relógio da UI
- `settings://language` (`"pt-BR" | "en" | "es"`): o idioma resolvido mudou; a bandeja e os títulos das janelas já foram atualizados
- `overlay://config`: posição, tamanho e modo (notch ou faixa) do overlay
- `overlay://hover` (bool): cursor entrou ou saiu do retângulo interativo
- `overlay://expanded` (bool): painel aberto ou fechado
- `overlay://focus-search`: foca o campo de busca
- `overlay://coach`: dica de primeiro uso após o onboarding

## Overlay click-through

O overlay é uma janela fixa de 520x640 px lógicos, centralizada no topo do monitor escolhido (padrão: o principal), sempre no topo e sem roubar foco. Como é maior que o conteúdo visível, ela ignora o cursor por padrão. O frontend informa o retângulo interativo (pílula ou painel) com `overlay_set_hit_rect`. Uma thread no backend consulta a posição global do cursor, converte para px lógicos relativos à janela (considerando a escala do monitor) e liga/desliga `set_ignore_cursor_events` conforme o cursor esteja dentro do retângulo, emitindo `overlay://hover` nas transições. Uma segunda thread reposiciona o overlay quando o conjunto de monitores muda.

- macOS: painel não ativador (tauri-nspanel), visível em todos os Spaces, com geometria do notch lida do `NSScreen`
- Windows: sem notch, modo faixa. `WS_EX_TOOLWINDOW` esconde o overlay do Alt+Tab; não ativação vem de `focusable(false)` e topmost de `always_on_top`. Foco só é concedido ao abrir a busca (`set_focusable(true)` + `SetForegroundWindow`)

## Detecção de ausência

Duas fontes, avaliadas a cada 5 s por `AbsenceMonitor` (lógica pura, testada sem relógio real):

1. Inatividade: segundos desde o último input via FFI (macOS: `CGEventSource`; Windows: `GetLastInputInfo` com `GetTickCount64`). Quando o idle passa do limite (padrão 15 min), o início da ausência é `agora - idle`. A pergunta aparece quando o usuário volta (idle < 5 s).
2. Suspensão: diferença entre relógio de parede e relógio monotônico. Se o parede avançou mais de 30 s além do monotônico entre dois ticks, a máquina dormiu; a ausência vai do último tick ao atual. Após uma suspensão o contador de idle do SO ainda abrange o sono, então é ignorado até haver input novo.

O usuário resolve com `resolve_absence`: descontar, marcar como almoço, manter ou mover para outro projeto. Com "parar ao suspender" ligado, o relógio para no início da ausência sem perguntar. Se o app fechar com uma pergunta pendente, a entrada fecha no início da ausência; após um crash, vale a regra do heartbeat de 2 minutos.

## Dados

SQLite em `app_data_dir()/timewatch.sqlite3` (schema v2: `entries.note`, migrações por `PRAGMA user_version`). Tempo em milissegundos UTC (`i64`); arredondamento só na exibição e exportação. Limites de dia vêm da meia-noite local pelo fuso, nunca de `início + 24h`, então dias de horário de verão (23h/25h) funcionam. Entradas que cruzam a meia-noite são divididas entre os dois dias nos relatórios.

## Limitações conhecidas

- macOS: fechar a tampa com monitor externo não suspende a máquina, então "parar ao suspender" não dispara
- Suspensões menores que ~35 s não são detectadas, e um salto do relógio para frente maior que 30 s é lido como suspensão
- Windows não tem notch: o overlay usa modo faixa
- Alt+Space conflita com o menu de janela do Windows (o atalho é configurável)
- Builds sem assinatura: Gatekeeper (macOS) e SmartScreen (Windows) pedem confirmação manual
- O comportamento no Windows foi verificado apenas pelo build no CI, não em execução; o `cargo check` cruzado a partir do macOS falha porque o SQLite embutido (`rusqlite` com `bundled`) não compila para MSVC fora do Windows
- Entradas que começam exatamente em 00:00:00 ou terminam na meia-noite seguinte têm a borda recortada travada na visão do dia
- O almoço automático também vale em dias com jornada 0 (fins de semana e feriados) quando uma entrada abrange o horário de referência
