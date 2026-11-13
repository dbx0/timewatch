# Timewatch

Controle de horas para macOS e Windows. Um relógio fica sempre à mão (no notch do Mac, numa faixa no topo da tela no Windows): você troca de projeto com um clique ou com o atalho global, e o app calcula jornada, almoço, horas extras e relatórios semanais. Tudo roda localmente, sem conta e sem rede.

## Telas

Capturas ainda não incluídas. Lista do que mostrar aqui:

- Notch / faixa: relógio recolhido e painel expandido com busca de projetos
- Pergunta de ausência (inatividade ou suspensão)
- Relatório: visão semanal e visão do dia
- Exportação (CSV e HTML)
- Configurações
- Primeira execução (onboarding)

## Instalação

Os builds não são assinados.

macOS: abra o `.dmg`, arraste o Timewatch para Aplicativos. Na primeira vez, clique com o botão direito no app e escolha Abrir. Se o Gatekeeper ainda bloquear:

```sh
xattr -dr com.apple.quarantine /Applications/Timewatch.app
```

Requer macOS 12.0 ou superior.

Windows: execute o instalador. Se o SmartScreen avisar, clique em "Mais informações" e depois em "Executar assim mesmo".

## Desenvolvimento

Requisitos: Node 22, pnpm, Rust estável e os pré-requisitos do [Tauri 2](https://tauri.app/start/prerequisites/).

```sh
pnpm i
pnpm tauri dev
```

Em builds de debug, o autostart fica desligado, a menos que `TIMEWATCH_DEV_AUTOSTART=1`. Também só em debug, `TIMEWATCH_DATA_DIR=/caminho` troca a pasta de dados.

## Testes

```sh
pnpm vitest run
(cd src-tauri && cargo test)
```

## Build

```sh
pnpm tauri build
```

No macOS gera `.app` e `.dmg` em `src-tauri/target/release/bundle/`. Para o build universal (usado no CI):

```sh
rustup target add x86_64-apple-darwin aarch64-apple-darwin
pnpm tauri build --target universal-apple-darwin
```

O workflow `.github/workflows/build.yml` roda testes e build em `macos-latest` e `windows-latest` a cada push e PR. Uma tag `v*` cria um release em rascunho com os instaladores.

## Dados e privacidade

Os dados ficam num único arquivo SQLite, `timewatch.sqlite3`, na pasta de dados do app (identificador `dev.timewatch.desktop`):

- macOS: `~/Library/Application Support/dev.timewatch.desktop/`
- Windows: `%APPDATA%\dev.timewatch.desktop\`

Versões antigas usavam o identificador `dev.timewatch.app`; na primeira execução o banco é copiado de lá automaticamente (a cópia antiga fica como backup).

O app não faz chamadas de rede, não tem telemetria e não exige conta. Para backup, copie o arquivo com o app fechado.

## Limitações conhecidas

Veja a lista completa em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#limitações-conhecidas).
