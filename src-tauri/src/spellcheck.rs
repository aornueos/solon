//! Comandos do corretor ortográfico expostos ao frontend.
//!
//! O algoritmo (dicionário, distância, sugestões) mora em `spell_engine`;
//! aqui ficam só o dicionário embutido, o dicionário pessoal e os comandos.
//!
//! Todos os comandos pesados usam `#[tauri::command(async)]`. Sem isso o
//! Tauri executa o comando na própria thread da janela: carregar as ~2,8
//! milhões de palavras ou calcular sugestões congelava o app inteiro
//! enquanto durava. Com `async` o trabalho vai para o pool de threads e a
//! janela continua respondendo.
//!
//! A lista de palavras é gerada por `scripts/copy-spellcheck-dict.cjs`
//! (postinstall do npm) em `public/dict/pt-words.txt`, embutida no binário
//! em tempo de compilação. A lista de frequência fica em
//! `src-tauri/data/pt-br-frequencia.txt`.

use crate::spell_engine::Dictionary;
use once_cell::sync::Lazy;
use std::collections::HashSet;
use std::sync::RwLock;

const WORDS_DATA: &str = include_str!("../../public/dict/pt-words.txt");

/// Palavras em ordem de uso, para ordenar sugestões (a comum antes da
/// flexão rara). Versionada no repositório; fonte e licença no cabeçalho.
const FREQUENCY_DATA: &str = include_str!("../data/pt-br-frequencia.txt");

/// Carregado na primeira consulta — o frontend dispara `spell_size` logo
/// depois de abrir o editor para isso acontecer antes do primeiro uso.
static DICTIONARY: Lazy<Dictionary<'static>> =
    Lazy::new(|| Dictionary::from_lines(WORDS_DATA).with_frequency(FREQUENCY_DATA));

/// Palavras adicionadas pelo usuário. O frontend guarda a lista e a
/// reenvia a cada início, então aqui ela só precisa viver em memória.
static PERSONAL: Lazy<RwLock<HashSet<String>>> = Lazy::new(|| RwLock::new(HashSet::new()));

/// Total de palavras do dicionário. Serve também para aquecer o
/// dicionário antes da primeira checagem.
#[tauri::command(async)]
pub fn spell_size() -> usize {
    DICTIONARY.len()
}

#[tauri::command(async)]
pub fn spell_check(word: String) -> bool {
    let lower = word.to_lowercase();
    if DICTIONARY.contains(&lower) {
        return true;
    }
    PERSONAL.read().map(|p| p.contains(&lower)).unwrap_or(false)
}

/// Checa várias palavras numa chamada só — usado pelo sublinhado do
/// editor, que confere o documento inteiro.
///
/// Falha explicitamente se o lock do dicionário pessoal estiver
/// envenenado: devolver tudo como correto esconderia o problema e o
/// usuário simplesmente não veria mais nenhum sublinhado.
#[tauri::command(async)]
pub fn spell_check_many(words: Vec<String>) -> Result<Vec<bool>, String> {
    let personal = PERSONAL
        .read()
        .map_err(|_| "personal dict lock poisoned".to_string())?;
    Ok(words
        .into_iter()
        .map(|word| {
            let lower = word.to_lowercase();
            DICTIONARY.contains(&lower) || personal.contains(&lower)
        })
        .collect())
}

/// Até `spell_engine::MAX_SUGGESTIONS` correções, da mais provável para a
/// menos provável.
#[tauri::command(async)]
pub fn spell_suggest(word: String) -> Vec<String> {
    DICTIONARY.suggest(&word.to_lowercase())
}

#[tauri::command]
pub fn spell_add(word: String) {
    if let Ok(mut p) = PERSONAL.write() {
        p.insert(word.to_lowercase());
    }
}

#[tauri::command]
pub fn spell_remove(word: String) {
    if let Ok(mut p) = PERSONAL.write() {
        p.remove(&word.to_lowercase());
    }
}
