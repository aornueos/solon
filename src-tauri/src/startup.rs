//! Arquivo com que o Solon foi aberto pelo sistema — "Abrir com", duplo
//! clique num `.md` associado ao app. O caminho chega como argumento da
//! linha de comando; a janela principal o pede uma vez, no arranque.

use std::path::Path;
use std::sync::Mutex;

static STARTUP_FILE: Mutex<Option<String>> = Mutex::new(None);

/// Guarda o primeiro argumento que é uma nota existente (`.md`/`.txt`).
/// Chamado uma vez, antes de a janela subir.
pub fn capture_from_args() {
    let file = std::env::args().skip(1).find(|arg| is_note_file(arg));
    if let Ok(mut slot) = STARTUP_FILE.lock() {
        *slot = file;
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
