#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        // O plugin `process` expõe `relaunch()`/`exit()` — necessário pra
        // reiniciar o app depois que o updater termina de instalar.
        .plugin(tauri_plugin_process::init())
        // Updater: lê o manifest configurado em `tauri.conf.json` (campo
        // `plugins.updater.endpoints`) e verifica a assinatura Ed25519
        // contra `pubkey`. Sem chave configurada o plugin compila mas
        // falha em runtime — isso e intencional: prefere quebrar agora a
        // aceitar update nao assinado.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .run(tauri::generate_context!())
        .expect("Erro ao inicializar o Solon");
}
