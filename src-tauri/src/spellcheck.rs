//! Comandos do corretor ortográfico expostos ao frontend.
//!
//! O algoritmo (dicionário, distância, sugestões) mora em `spell_engine`;
//! aqui ficam os dicionários embutidos, o dicionário pessoal e os comandos.
//!
//! Todos os comandos pesados usam `#[tauri::command(async)]`. Sem isso o
//! Tauri executa o comando na própria thread da janela: carregar as ~2,8
//! milhões de palavras ou calcular sugestões congelava o app inteiro
//! enquanto durava. Com `async` o trabalho vai para o pool de threads e a
//! janela continua respondendo.
//!
//! As listas de palavras são geradas por `scripts/copy-spellcheck-dict.cjs`
//! (postinstall do npm) em `public/dict/`, embutidas no binário em tempo
//! de compilação. As listas de frequência ficam em `src-tauri/data/`.
//!
//! Idiomas: português (padrão) e inglês, um ou os dois. Cada dicionário
//! só é carregado na primeira vez que o idioma fica ativo.

use crate::spell_engine::{self, Dictionary, ENGLISH_SPLIT_HEADS};
use once_cell::sync::Lazy;
use std::collections::HashSet;
use std::sync::RwLock;

const PT_WORDS: &str = include_str!("../../public/dict/pt-words.txt");
const EN_WORDS: &str = include_str!("../../public/dict/en-words.txt");

/// Palavras em ordem de uso, para ordenar sugestões (a comum antes da
/// flexão rara). Versionadas no repositório; fonte e licença no cabeçalho.
const PT_FREQUENCY: &str = include_str!("../data/pt-br-frequencia.txt");
const EN_FREQUENCY: &str = include_str!("../data/en-us-frequencia.txt");

static PORTUGUESE: Lazy<Dictionary<'static>> =
    Lazy::new(|| Dictionary::from_lines(PT_WORDS).with_frequency(PT_FREQUENCY));

static ENGLISH: Lazy<Dictionary<'static>> = Lazy::new(|| {
    Dictionary::from_lines(EN_WORDS)
        .with_frequency(EN_FREQUENCY)
        .with_split_heads(ENGLISH_SPLIT_HEADS)
});

#[derive(Clone, Copy)]
struct Languages {
    portuguese: bool,
    english: bool,
}

const DEFAULT_LANGUAGES: Languages = Languages {
    portuguese: true,
    english: false,
};

/// Idiomas ativos. O frontend manda a escolha dos Ajustes ao iniciar e a
/// cada troca.
static LANGUAGES: RwLock<Languages> = RwLock::new(DEFAULT_LANGUAGES);

/// Palavras adicionadas pelo usuário. O frontend guarda a lista e a
/// reenvia a cada início, então aqui ela só precisa viver em memória.
static PERSONAL: Lazy<RwLock<HashSet<String>>> = Lazy::new(|| RwLock::new(HashSet::new()));

fn active_dictionaries() -> Vec<&'static Dictionary<'static>> {
    let languages = LANGUAGES.read().map(|l| *l).unwrap_or(DEFAULT_LANGUAGES);
    let mut out = Vec::with_capacity(2);
    if languages.portuguese {
        out.push(&*PORTUGUESE);
    }
    if languages.english {
        out.push(&*ENGLISH);
    }
    out
}

/// Forma consultada: minúscula e com apóstrofo reto — o editor troca o
/// reto pelo curvo ao digitar ("don’t").
fn spell_form(word: &str) -> String {
    word.to_lowercase().replace(['’', 'ʼ'], "'")
}

/// Escolhe os idiomas do corretor ("pt-BR", "en-US"). Sem nenhum idioma
/// conhecido, volta ao português. Devolve o total de palavras, o que já
/// carrega os dicionários escolhidos antes da primeira checagem.
#[tauri::command(async)]
pub fn spell_set_languages(languages: Vec<String>) -> Result<usize, String> {
    let mut chosen = Languages {
        portuguese: languages.iter().any(|l| l.eq_ignore_ascii_case("pt-BR")),
        english: languages.iter().any(|l| l.eq_ignore_ascii_case("en-US")),
    };
    if !chosen.portuguese && !chosen.english {
        chosen = DEFAULT_LANGUAGES;
    }
    *LANGUAGES
        .write()
        .map_err(|_| "spellcheck languages lock poisoned".to_string())? = chosen;
    Ok(spell_size())
}

/// Total de palavras dos dicionários ativos. Serve também para aquecer os
/// dicionários antes da primeira checagem.
#[tauri::command(async)]
pub fn spell_size() -> usize {
    active_dictionaries().iter().map(|d| d.len()).sum()
}

#[tauri::command(async)]
pub fn spell_check(word: String) -> bool {
    let word = spell_form(&word);
    let personal = PERSONAL.read();
    spell_engine::is_known(&active_dictionaries(), &word, |w| {
        personal.as_ref().map(|p| p.contains(w)).unwrap_or(false)
    })
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
    let dictionaries = active_dictionaries();
    Ok(words
        .into_iter()
        .map(|word| {
            spell_engine::is_known(&dictionaries, &spell_form(&word), |w| personal.contains(w))
        })
        .collect())
}

/// Até `spell_engine::MAX_SUGGESTIONS` correções, da mais provável para a
/// menos provável, dos idiomas ativos.
#[tauri::command(async)]
pub fn spell_suggest(word: String) -> Vec<String> {
    spell_engine::suggest_in(&active_dictionaries(), &spell_form(&word))
}

#[tauri::command]
pub fn spell_add(word: String) {
    if let Ok(mut p) = PERSONAL.write() {
        p.insert(spell_form(&word));
    }
}

#[tauri::command]
pub fn spell_remove(word: String) {
    if let Ok(mut p) = PERSONAL.write() {
        p.remove(&spell_form(&word));
    }
}
