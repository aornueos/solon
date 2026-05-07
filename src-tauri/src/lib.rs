mod spellcheck;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // O plugin `process` expõe `relaunch()`/`exit()` — necessário pra
        // reiniciar o app depois que o updater termina de instalar.
        .plugin(tauri_plugin_process::init())
        // Updater: lê o manifest configurado em `tauri.conf.json` (campo
        // `plugins.updater.endpoints`) e verifica a assinatura Ed25519
        // contra `pubkey`. Sem chave configurada o plugin compila mas
        // falha em runtime — isso e intencional: prefere quebrar agora a
        // aceitar update nao assinado.
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Spellcheck nativo. Tres tentativas em JS falharam (V8
        // explodia com "Too many properties to enumerate" ao processar
        // o dict pt-BR). Backend Rust nao tem esse limite, lookup
        // contra HashSet e' O(1), e Levenshtein nativo lista 312k
        // candidatos em ~5-15ms.
        .invoke_handler(tauri::generate_handler![
            spellcheck::spell_size,
            spellcheck::spell_check,
            spellcheck::spell_check_many,
            spellcheck::spell_suggest,
            spellcheck::spell_add,
            spellcheck::spell_remove,
        ])
        .run(tauri::generate_context!())
        .expect("Erro ao inicializar o Solon");
}
