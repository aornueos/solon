//! Spellcheck nativo em Rust — substitui as tentativas frustradas em JS
//! (nspell/typo-js davam "Too many properties to enumerate" no V8 ao
//! processar o dicionario pt-BR; hunspell-asm e' incompativel com Vite
//! workers).
//!
//! Estrategia: word list bundled via `include_str!` em build time. Em
//! runtime, HashSet pra check O(1), Vec ordenado pra suggest via
//! Levenshtein bounded. Tudo nativo, sem limites de motor JS.
//!
//! O wordlist e' gerado pelo `scripts/copy-spellcheck-dict.cjs` (npm
//! postinstall) extraindo as 312k palavras-base do `.dic` do
//! `dictionary-pt`. Ficam no caminho `public/dict/pt-words.txt` que e'
//! relativo ao `src-tauri/src/spellcheck.rs` como `../../public/...`.

use once_cell::sync::Lazy;
use std::collections::HashSet;
use std::sync::RwLock;

/// Lista de palavras pt-BR embutida no binario em build-time.
/// ~3.5MB de UTF-8. Lido uma vez aqui, parseado lazy nas estruturas.
const WORDS_DATA: &str = include_str!("../../public/dict/pt-words.txt");

/// Limite de edit distance pra considerar candidate como sugestao.
const MAX_DISTANCE: usize = 2;
/// Cap de sugestoes retornadas — UX do menu nao acomoda mais que isso.
const MAX_SUGGESTIONS: usize = 8;

/// Conjunto de palavras pra check O(1). Mutavel pra acomodar dict
/// pessoal (palavras adicionadas pelo user via "Adicionar ao dicionario"
/// no context menu).
static WORDS: Lazy<RwLock<HashSet<String>>> = Lazy::new(|| {
    let set: HashSet<String> = WORDS_DATA
        .lines()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect();
    RwLock::new(set)
});

/// Vec ordenado das mesmas palavras — usado em suggest pra iterar
/// candidates. Mantemos separado do HashSet porque iterar HashSet em
/// ordem indeterminada nao e' bom pra ranking.
static WORD_LIST: Lazy<Vec<String>> = Lazy::new(|| {
    let mut v: Vec<String> = WORDS_DATA
        .lines()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect();
    v.sort();
    v
});

/// Retorna o numero total de palavras carregadas. Usado pelo facade JS
/// pra confirmar que o backend esta vivo.
#[tauri::command]
pub fn spell_size() -> usize {
    WORD_LIST.len()
}

/// Verifica se a palavra e' "correta" (esta no dicionario base ou no
/// dict pessoal). Lowercase pra normalizacao — palavras sao
/// armazenadas em minusculo.
#[tauri::command]
pub fn spell_check(word: String) -> bool {
    let lower = word.to_lowercase();
    WORDS.read().map(|w| w.contains(&lower)).unwrap_or(false)
}

/// Retorna ate' MAX_SUGGESTIONS palavras com edit distance ate'
/// MAX_DISTANCE. Ordenado por distance asc, depois alfabetico.
///
/// Implementacao: itera o Vec inteiro com poda agressiva — palavras com
/// diferenca de comprimento > max_dist sao descartadas sem rodar o DP.
/// O Levenshtein em si tem early-exit por linha (se a linha minima
/// excede max_dist, retorna max+1 imediatamente).
///
/// Performance em maquina tipica: ~5-15ms pra palavra de 5 caracteres
/// vs lista de 312k. Roda numa thread Tauri que nao bloqueia nem o
/// frontend nem outras commands.
#[tauri::command]
pub fn spell_suggest(word: String) -> Vec<String> {
    let lower = word.to_lowercase();
    let target_chars: Vec<char> = lower.chars().collect();
    let target_len = target_chars.len();

    let mut candidates: Vec<(String, usize)> = Vec::new();

    for candidate in WORD_LIST.iter() {
        let cand_chars: Vec<char> = candidate.chars().collect();
        let cand_len = cand_chars.len();
        let diff = if cand_len > target_len {
            cand_len - target_len
        } else {
            target_len - cand_len
        };
        if diff > MAX_DISTANCE {
            continue;
        }
        let dist = levenshtein_bounded(&target_chars, &cand_chars, MAX_DISTANCE);
        if dist <= MAX_DISTANCE {
            candidates.push((candidate.clone(), dist));
        }
    }

    candidates.sort_by(|a, b| a.1.cmp(&b.1).then_with(|| a.0.cmp(&b.0)));
    candidates
        .into_iter()
        .take(MAX_SUGGESTIONS)
        .map(|(w, _)| w)
        .collect()
}

/// Adiciona palavra ao dicionario em memoria (dict pessoal). O facade
/// JS persiste em localStorage e re-emite essa command no startup,
/// entao a palavra "fica" entre sessoes apesar do RwLock voltar pro
/// estado inicial em cada inicializacao.
#[tauri::command]
pub fn spell_add(word: String) {
    let lower = word.to_lowercase();
    if let Ok(mut w) = WORDS.write() {
        w.insert(lower);
    }
}

/// Remove palavra do dict pessoal (caso futuro: settings > dicionario
/// pessoal). NAO afeta as palavras do .dic — so' tira o que foi
/// adicionado em runtime.
#[tauri::command]
pub fn spell_remove(word: String) {
    let lower = word.to_lowercase();
    if let Ok(mut w) = WORDS.write() {
        w.remove(&lower);
    }
}

/// Levenshtein DP com early exit. Recebe slices de chars (nao bytes!)
/// pra contar caracteres Unicode corretamente — o pt-BR tem 'ã', 'ç',
/// 'á', etc., que ocupam multiplos bytes em UTF-8.
///
/// `max` define o teto de distance — se em qualquer linha do DP a
/// menor entrada ja' excede max, retornamos max+1 sem terminar.
fn levenshtein_bounded(a: &[char], b: &[char], max: usize) -> usize {
    let len_a = a.len();
    let len_b = b.len();

    let diff = if len_a > len_b {
        len_a - len_b
    } else {
        len_b - len_a
    };
    if diff > max {
        return max + 1;
    }
    if len_a == 0 {
        return len_b;
    }
    if len_b == 0 {
        return len_a;
    }

    let mut prev: Vec<usize> = (0..=len_b).collect();
    let mut curr: Vec<usize> = vec![0; len_b + 1];

    for i in 1..=len_a {
        curr[0] = i;
        let mut row_min = i;
        let ai = a[i - 1];
        for j in 1..=len_b {
            let cost = if ai == b[j - 1] { 0 } else { 1 };
            let v = (curr[j - 1] + 1)
                .min(prev[j] + 1)
                .min(prev[j - 1] + cost);
            curr[j] = v;
            if v < row_min {
                row_min = v;
            }
        }
        if row_min > max {
            return max + 1;
        }
        std::mem::swap(&mut prev, &mut curr);
    }

    prev[len_b]
}
