//! Arquivo com que o Solon foi aberto pelo sistema — "Abrir com", duplo
//! clique num `.md` associado ao app. No Windows e no Linux o caminho
//! chega como argumento da linha de comando; no macOS chega como evento
//! (`RunEvent::Opened`), inclusive com o app já aberto. Nos dois casos
//! fica guardado aqui até a janela principal pedir, uma vez.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

static STARTUP_FILE: Mutex<Option<String>> = Mutex::new(None);

/// Evento que avisa a janela de que há arquivo para abrir com o app já
/// aberto. Ela busca o caminho com `take_startup_file`.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub const OPEN_FILE_EVENT: &str = "solon://open-file";

/// Guarda o primeiro argumento que é uma nota existente (`.md`/`.txt`).
/// Chamado uma vez, antes de a janela subir.
pub fn capture_from_args() {
    let file = std::env::args().skip(1).find(|arg| is_note_file(arg));
    if let Ok(mut slot) = STARTUP_FILE.lock() {
        *slot = file;
    }
}

/// Guarda a primeira nota existente entre os caminhos pedidos pelo
/// sistema. Devolve se guardou alguma.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn remember_opened<I: IntoIterator<Item = PathBuf>>(paths: I) -> bool {
    let Some(file) = paths
        .into_iter()
        .map(|path| path.to_string_lossy().into_owned())
        .find(|path| is_note_file(path))
    else {
        return false;
    };
    match STARTUP_FILE.lock() {
        Ok(mut slot) => {
            *slot = Some(file);
            true
        }
        Err(_) => false,
    }
}

fn is_note_file(arg: &str) -> bool {
    let lower = arg.to_lowercase();
    (lower.ends_with(".md") || lower.ends_with(".txt")) && Path::new(arg).is_file()
}

/// Entrega o arquivo de abertura uma única vez: uma segunda janela, ou um
/// recarregamento da página, não reabre o mesmo arquivo.
#[tauri::command]
pub fn take_startup_file() -> Option<String> {
    STARTUP_FILE.lock().ok().and_then(|mut slot| slot.take())
}
