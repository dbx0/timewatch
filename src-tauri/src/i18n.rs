//! Strings for everything Rust shows the user (errors, notices, tray, window titles, exports)
//! in pt-BR, English and Spanish. Pure: callers pass the resolved `Lang`; only `system_lang`
//! reads the OS locale.

use serde::{Deserialize, Serialize};

/// A resolved UI language.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Lang {
    #[serde(rename = "pt-BR")]
    PtBr,
    #[serde(rename = "en")]
    En,
    #[serde(rename = "es")]
    Es,
}

/// The user's choice in Settings; `System` follows the OS locale.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum LanguagePref {
    #[default]
    #[serde(rename = "system")]
    System,
    #[serde(rename = "pt-BR")]
    PtBr,
    #[serde(rename = "en")]
    En,
    #[serde(rename = "es")]
    Es,
}

impl LanguagePref {
    pub fn resolve(self, system: Lang) -> Lang {
        match self {
            Self::System => system,
            Self::PtBr => Lang::PtBr,
            Self::En => Lang::En,
            Self::Es => Lang::Es,
        }
    }
}

impl Lang {
    /// `pt*` -> pt-BR, `es*` -> es, anything else (including `en*`) -> en.
    pub fn from_locale(tag: &str) -> Lang {
        let primary = tag.trim().split(['-', '_', '.', '@']).next().unwrap_or("").to_ascii_lowercase();
        match primary.as_str() {
            "pt" => Lang::PtBr,
            "es" => Lang::Es,
            _ => Lang::En,
        }
    }

    pub fn from_locale_opt(tag: Option<&str>) -> Lang {
        tag.map_or(Lang::En, Lang::from_locale)
    }

    /// BCP 47 code, also used as the HTML `lang` attribute.
    pub fn code(self) -> &'static str {
        match self {
            Lang::PtBr => "pt-BR",
            Lang::En => "en",
            Lang::Es => "es",
        }
    }

    pub fn decimal_sep(self) -> char {
        match self {
            Lang::En => '.',
            Lang::PtBr | Lang::Es => ',',
        }
    }

    /// CSV field separator: `;` where the decimal separator is a comma.
    pub fn csv_sep(self) -> char {
        match self {
            Lang::En => ',',
            Lang::PtBr | Lang::Es => ';',
        }
    }

    pub fn strings(self) -> &'static Strings {
        match self {
            Lang::PtBr => &PT_BR,
            Lang::En => &EN,
            Lang::Es => &ES,
        }
    }
}

/// The OS language (the only place that reads the locale).
pub fn system_lang() -> Lang {
    Lang::from_locale_opt(sys_locale::get_locale().as_deref())
}

/// Replaces each `{}` in `tpl` with the next arg (missing args leave the rest as is).
pub fn fill(tpl: &str, args: &[&str]) -> String {
    let mut out = String::with_capacity(tpl.len());
    let mut args = args.iter();
    let mut rest = tpl;
    while let Some(i) = rest.find("{}") {
        let Some(a) = args.next() else { break };
        out.push_str(&rest[..i]);
        out.push_str(a);
        rest = &rest[i + 2..];
    }
    out.push_str(rest);
    out
}

/// One language's strings. `{}` marks a placeholder filled with `fill`.
pub struct Strings {
    // Tracker errors
    pub err_store: &'static str,
    pub err_not_found: &'static str,
    pub err_invalid_range: &'static str,
    pub err_overlap: &'static str,
    pub err_future_end: &'static str,
    pub err_no_session: &'static str,
    pub err_note_too_long: &'static str,
    // Command errors
    pub err_invalid_date: &'static str,
    pub err_invalid_grouping: &'static str,
    pub err_invalid_format: &'static str,
    pub err_save_file: &'static str,
    pub err_invalid_shortcut: &'static str,
    pub err_register_shortcut: &'static str,
    pub err_unknown_window: &'static str,
    // Tracker notices (`{}` = HH:MM)
    pub notice_sleep: &'static str,
    pub notice_quit: &'static str,
    // Tray
    pub tray_open: &'static str,
    pub tray_week: &'static str,
    pub tray_settings: &'static str,
    pub tray_quit: &'static str,
    pub tray_paused: &'static str,
    // Window titles
    pub win_report: &'static str,
    pub win_settings: &'static str,
    pub win_onboarding: &'static str,
    // Exports
    pub export_title: &'static str,
    pub card_total: &'static str,
    pub card_expected: &'static str,
    pub card_extra: &'static str,
    pub row_total: &'static str,
    pub row_extra: &'static str,
    pub col_project: &'static str,
    pub col_client: &'static str,
    pub col_total: &'static str,
    pub extra_suffix: &'static str,
    pub records_title: &'static str,
    pub rec_date: &'static str,
    pub rec_start: &'static str,
    pub rec_end: &'static str,
    pub rec_hours: &'static str,
    pub rec_note: &'static str,
    pub period_to: &'static str,
    pub projects_suffix: &'static str,
    pub day_names: [&'static str; 7],
    /// chrono formats for full and day/month dates in the HTML export.
    pub date_fmt: &'static str,
    pub short_date_fmt: &'static str,
    pub csv_summary_header: [&'static str; 6],
    pub csv_detailed_header: [&'static str; 7],
}

pub static PT_BR: Strings = Strings {
    err_store: "Erro ao acessar os dados: {}",
    err_not_found: "Registro não encontrado",
    err_invalid_range: "O início precisa ser antes do fim",
    err_overlap: "Esse horário sobrepõe outro registro",
    err_future_end: "O registro não pode terminar no futuro",
    err_no_session: "Nenhuma sessão ativa",
    err_note_too_long: "A nota pode ter no máximo 500 caracteres",
    err_invalid_date: "Data inválida: {}",
    err_invalid_grouping: "Agrupamento inválido: {}",
    err_invalid_format: "Formato inválido: {}",
    err_save_file: "Não foi possível salvar o arquivo: {}",
    err_invalid_shortcut: "Atalho inválido \"{}\": {}",
    err_register_shortcut: "Não foi possível registrar o atalho \"{}\": {}",
    err_unknown_window: "Janela desconhecida: {}",
    notice_sleep: "O relógio foi parado às {}, quando o computador entrou em repouso",
    notice_quit: "O relógio foi parado às {}, quando o app fechou",
    tray_open: "Abrir",
    tray_week: "Ver semana",
    tray_settings: "Configurações",
    tray_quit: "Sair",
    tray_paused: "pausado",
    win_report: "Horas",
    win_settings: "Configurações",
    win_onboarding: "Bem-vindo",
    export_title: "Horas da semana",
    card_total: "Total",
    card_expected: "Jornada prevista",
    card_extra: "Hora extra",
    row_total: "Total",
    row_extra: "Hora extra",
    col_project: "Projeto",
    col_client: "Cliente",
    col_total: "Total",
    extra_suffix: "extra",
    records_title: "Registros",
    rec_date: "Data",
    rec_start: "Início",
    rec_end: "Fim",
    rec_hours: "Horas",
    rec_note: "Nota",
    period_to: "a",
    projects_suffix: "projetos",
    day_names: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"],
    date_fmt: "%d/%m/%Y",
    short_date_fmt: "%d/%m",
    csv_summary_header: ["data", "cliente", "projeto", "horas_normais", "horas_extras", "horas_total"],
    csv_detailed_header: ["data", "cliente", "projeto", "inicio", "fim", "horas", "nota"],
};

pub static EN: Strings = Strings {
    err_store: "Couldn't access the data: {}",
    err_not_found: "Record not found",
    err_invalid_range: "Start has to be before end",
    err_overlap: "This time overlaps another record",
    err_future_end: "A record can't end in the future",
    err_no_session: "No active session",
    err_note_too_long: "Notes can have at most 500 characters",
    err_invalid_date: "Invalid date: {}",
    err_invalid_grouping: "Invalid grouping: {}",
    err_invalid_format: "Invalid format: {}",
    err_save_file: "Couldn't save the file: {}",
    err_invalid_shortcut: "Invalid shortcut \"{}\": {}",
    err_register_shortcut: "Couldn't register the shortcut \"{}\": {}",
    err_unknown_window: "Unknown window: {}",
    notice_sleep: "The clock was stopped at {}, when the computer went to sleep",
    notice_quit: "The clock was stopped at {}, when the app closed",
    tray_open: "Open",
    tray_week: "View week",
    tray_settings: "Settings",
    tray_quit: "Quit",
    tray_paused: "paused",
    win_report: "Hours",
    win_settings: "Settings",
    win_onboarding: "Welcome",
    export_title: "Weekly hours",
    card_total: "Total",
    card_expected: "Expected workday",
    card_extra: "Overtime",
    row_total: "Total",
    row_extra: "Overtime",
    col_project: "Project",
    col_client: "Client",
    col_total: "Total",
    extra_suffix: "overtime",
    records_title: "Records",
    rec_date: "Date",
    rec_start: "Start",
    rec_end: "End",
    rec_hours: "Hours",
    rec_note: "Note",
    period_to: "to",
    projects_suffix: "projects",
    day_names: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    date_fmt: "%m/%d/%Y",
    short_date_fmt: "%m/%d",
    csv_summary_header: ["date", "client", "project", "regular_hours", "overtime_hours", "total_hours"],
    csv_detailed_header: ["date", "client", "project", "start", "end", "hours", "note"],
};

pub static ES: Strings = Strings {
    err_store: "Error al acceder a los datos: {}",
    err_not_found: "Registro no encontrado",
    err_invalid_range: "El inicio tiene que ser antes del fin",
    err_overlap: "Este horario se superpone con otro registro",
    err_future_end: "El registro no puede terminar en el futuro",
    err_no_session: "No hay ninguna sesión activa",
    err_note_too_long: "La nota puede tener como máximo 500 caracteres",
    err_invalid_date: "Fecha inválida: {}",
    err_invalid_grouping: "Agrupación inválida: {}",
    err_invalid_format: "Formato inválido: {}",
    err_save_file: "No se pudo guardar el archivo: {}",
    err_invalid_shortcut: "Atajo inválido \"{}\": {}",
    err_register_shortcut: "No se pudo registrar el atajo \"{}\": {}",
    err_unknown_window: "Ventana desconocida: {}",
    notice_sleep: "El reloj se detuvo a las {}, cuando la computadora entró en reposo",
    notice_quit: "El reloj se detuvo a las {}, cuando la app se cerró",
    tray_open: "Abrir",
    tray_week: "Ver semana",
    tray_settings: "Configuración",
    tray_quit: "Salir",
    tray_paused: "en pausa",
    win_report: "Horas",
    win_settings: "Configuración",
    win_onboarding: "Bienvenido",
    export_title: "Horas de la semana",
    card_total: "Total",
    card_expected: "Jornada prevista",
    card_extra: "Horas extra",
    row_total: "Total",
    row_extra: "Horas extra",
    col_project: "Proyecto",
    col_client: "Cliente",
    col_total: "Total",
    extra_suffix: "extra",
    records_title: "Registros",
    rec_date: "Fecha",
    rec_start: "Inicio",
    rec_end: "Fin",
    rec_hours: "Horas",
    rec_note: "Nota",
    period_to: "a",
    projects_suffix: "proyectos",
    day_names: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"],
    date_fmt: "%d/%m/%Y",
    short_date_fmt: "%d/%m",
    csv_summary_header: ["fecha", "cliente", "proyecto", "horas_normales", "horas_extra", "horas_total"],
    csv_detailed_header: ["fecha", "cliente", "proyecto", "inicio", "fin", "horas", "nota"],
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn locale_detection_table() {
        let cases = [
            ("pt-BR", Lang::PtBr),
            ("pt_PT.UTF-8", Lang::PtBr),
            ("PT", Lang::PtBr),
            ("es-ES", Lang::Es),
            ("es_419", Lang::Es),
            ("en-US", Lang::En),
            ("en", Lang::En),
            ("fr-FR", Lang::En),
            ("de", Lang::En),
            ("C", Lang::En),
            ("", Lang::En),
        ];
        for (tag, want) in cases {
            assert_eq!(Lang::from_locale(tag), want, "{tag}");
        }
        assert_eq!(Lang::from_locale_opt(None), Lang::En);
    }

    #[test]
    fn preference_resolves_against_system() {
        assert_eq!(LanguagePref::System.resolve(Lang::Es), Lang::Es);
        assert_eq!(LanguagePref::En.resolve(Lang::Es), Lang::En);
        assert_eq!(LanguagePref::PtBr.resolve(Lang::En), Lang::PtBr);
        assert_eq!(LanguagePref::Es.resolve(Lang::PtBr), Lang::Es);
        assert_eq!(LanguagePref::default(), LanguagePref::System);
    }

    #[test]
    fn serde_codes() {
        use serde_json::{from_value, json, to_value};
        assert_eq!(to_value(Lang::PtBr).unwrap(), json!("pt-BR"));
        assert_eq!(to_value(Lang::En).unwrap(), json!("en"));
        assert_eq!(to_value(Lang::Es).unwrap(), json!("es"));
        assert_eq!(to_value(LanguagePref::System).unwrap(), json!("system"));
        assert_eq!(from_value::<LanguagePref>(json!("pt-BR")).unwrap(), LanguagePref::PtBr);
        assert_eq!(from_value::<LanguagePref>(json!("es")).unwrap(), LanguagePref::Es);
        assert_eq!(Lang::En.code(), "en");
    }

    #[test]
    fn fill_replaces_placeholders_in_order() {
        assert_eq!(fill("a {} b {}", &["1", "2"]), "a 1 b 2");
        assert_eq!(fill("no args", &[]), "no args");
        assert_eq!(fill("{} only", &["x", "extra"]), "x only");
    }

    #[test]
    fn number_formats_per_language() {
        assert_eq!(Lang::PtBr.decimal_sep(), ',');
        assert_eq!(Lang::Es.decimal_sep(), ',');
        assert_eq!(Lang::En.decimal_sep(), '.');
        assert_eq!(Lang::PtBr.csv_sep(), ';');
        assert_eq!(Lang::Es.csv_sep(), ';');
        assert_eq!(Lang::En.csv_sep(), ',');
    }

    #[test]
    fn tables_are_distinct_and_complete() {
        for l in [Lang::PtBr, Lang::En, Lang::Es] {
            let s = l.strings();
            assert_eq!(s.day_names.len(), 7);
            assert!(s.notice_sleep.contains("{}") && s.notice_quit.contains("{}"), "{l:?}");
            assert!(s.err_store.contains("{}"), "{l:?}");
        }
        assert_eq!(Lang::PtBr.strings().tray_quit, "Sair");
        assert_eq!(Lang::En.strings().tray_quit, "Quit");
        assert_eq!(Lang::Es.strings().tray_quit, "Salir");
        assert_eq!(Lang::En.strings().day_names[0], "Mon");
        assert_eq!(Lang::Es.strings().day_names[0], "Lun");
        assert_eq!(Lang::PtBr.strings().day_names[0], "Seg");
    }
}
