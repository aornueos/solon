//! Spellcheck nativo em Rust — substitui as tentativas frustradas em JS
//! (nspell/typo-js davam "Too many properties to enumerate" no V8 ao
//! processar o dicionario pt-BR; hunspell-asm e' incompativel com Vite
//! workers).
//!
//! Estrategia: word list bundled via `include_str!` em build time. Em
//! runtime, mantemos um unico `Vec<String>` ordenado pra busca binaria
//! O(log n) e iteracao em ordem alfabetica, com indice por tamanho pra
//! cortar o espaco de busca em suggest. O dicionario pessoal (palavras
//! adicionadas pelo user) fica num `HashSet` separado e pequeno.
//!
//! Antes mantinhamos HashSet + Vec duplicados (~10MB pra 312k strings);
//! agora e' um Vec so + um indice de buckets por len pra suggest.
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

/// Lista canonica de palavras, ordenada alfabeticamente. Single source
/// of truth pra spell_check (binary_search) e iteracao em suggest.
/// `Vec<String>` (em vez de `&'static str`) porque a comparacao com
/// queries em runtime usa `String` — evita conversoes.
static WORD_LIST: Lazy<Vec<String>> = Lazy::new(|| {
    let mut v: Vec<String> = WORDS_DATA
        .lines()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect();
    v.sort();
    v.dedup();
    v
});

/// Indice por tamanho (em chars Unicode): para cada length, os indices
/// no `WORD_LIST` das palavras com aquele tamanho. Em suggest a gente
/// so' varre buckets [target_len-MAX_DISTANCE..target_len+MAX_DISTANCE]
/// — corta ~80% do espaco de busca pra palavras de 3-8 chars.
static LEN_INDEX: Lazy<Vec<Vec<u32>>> = Lazy::new(|| {
    let words = &*WORD_LIST;
    let max_len = words.iter().map(|w| w.chars().count()).max().unwrap_or(0);
    let mut buckets: Vec<Vec<u32>> = (0..=max_len).map(|_| Vec::new()).collect();
    for (idx, w) in words.iter().enumerate() {
        let len = w.chars().count();
        if len < buckets.len() {
            buckets[len].push(idx as u32);
        }
    }
    buckets
});

/// Dicionario pessoal — palavras adicionadas pelo user via "Adicionar
/// ao dicionario" no context menu. Pequeno (dezenas/centenas de
/// palavras), entao HashSet aqui nao gera duplicacao significativa.
static PERSONAL: Lazy<RwLock<HashSet<String>>> =
    Lazy::new(|| RwLock::new(HashSet::new()));

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
    if WORD_LIST.binary_search(&lower).is_ok() {
        return true;
    }
    PERSONAL
        .read()
        .map(|p| p.contains(&lower))
        .unwrap_or(false)
}

/// Checa varias palavras em uma unica chamada Tauri. Usado pelo underline
/// visual do editor para evitar centenas de round-trips JS -> Rust.
///
/// Falha o command (Result::Err) se o lock do dict pessoal estiver
/// poisoned — antes a gente "fail-aberto" retornando todas como corretas,
/// o que mascarava o estado quebrado e o user nao via underline em nada.
/// Erro explicito faz o facade JS detectar o problema (ex: re-init).
#[tauri::command]
pub fn spell_check_many(words: Vec<String>) -> Result<Vec<bool>, String> {
    let personal = PERSONAL
        .read()
        .map_err(|_| "personal dict lock poisoned".to_string())?;
    let result = words
        .into_iter()
        .map(|word| {
            let lower = word.to_lowercase();
            WORD_LIST.binary_search(&lower).is_ok() || personal.contains(&lower)
        })
        .collect();
    Ok(result)
}

/// Retorna ate' MAX_SUGGESTIONS palavras candidatas ranqueadas.
///
/// Heuristica de scoring (menor score = melhor sugestao):
///  1. **Diacritico-only match** (ex: "nao" ↔ "não"): prioridade
///     absoluta. Cobre o caso mais comum em pt-BR — usuario digita
///     sem acento e quer o acento de volta.
///  2. **Prefixo compartilhado**: palavras com inicio em comum sao
///     preferidas. Sem isso, "nao" sugeriria "ao" (delete primeiro
///     char) antes de "naco" (insert um char) por ordem alfabetica.
///  3. **Edit distance** (Levenshtein): bruto, capado em MAX_DISTANCE.
///
/// Otimizacao: em vez de varrer as 312k palavras, indexamos por
/// tamanho e so' visitamos os buckets [target_len ± MAX_DISTANCE].
/// Pra palavra de 5 chars, isso significa ~5 buckets dos ~30 totais
/// (~83% do espaco eliminado antes de qualquer Levenshtein).
#[tauri::command]
pub fn spell_suggest(word: String) -> Vec<String> {
    let lower = word.to_lowercase();
    let target_chars: Vec<char> = lower.chars().collect();
    let target_len = target_chars.len();
    if target_len == 0 {
        return Vec::new();
    }
    // Versao "achatada" do target — sem acentos. Usado pra detectar
    // candidatos que diferem APENAS em diacriticos (caso mais comum
    // de typo em pt-BR: usuario nao digita o til/cedilha/acento).
    let target_flat: String = lower.chars().map(strip_accent).collect();

    let words = &*WORD_LIST;
    let buckets = &*LEN_INDEX;
    let lo = target_len.saturating_sub(MAX_DISTANCE);
    let hi = (target_len + MAX_DISTANCE).min(buckets.len().saturating_sub(1));

    let mut candidates: Vec<(&str, i32)> = Vec::new();

    for len in lo..=hi {
        let bucket = match buckets.get(len) {
            Some(b) => b,
            None => continue,
        };
        for &idx in bucket {
            let candidate = &words[idx as usize];
            let cand_chars: Vec<char> = candidate.chars().collect();
            let dist = levenshtein_bounded(&target_chars, &cand_chars, MAX_DISTANCE);
            if dist > MAX_DISTANCE {
                continue;
            }

            // Score combinado: bonus enorme se for so' diferenca de acento,
            // bonus menor por prefixo em comum, penalidade pela distance.
            let cand_flat: String = candidate.chars().map(strip_accent).collect();
            let accent_only = cand_flat == target_flat;
            let prefix = shared_prefix_len(&target_chars, &cand_chars);

            // -1000 garante que QUALQUER match diacritico-only fica no
            // topo, mesmo com distance maior. Os tiebreakers (dist, prefix)
            // ainda ordenam dentro desse "tier".
            let score = if accent_only {
                -1000 + (dist as i32) * 10 - (prefix as i32)
            } else {
                (dist as i32) * 100 - (prefix as i32) * 10
            };

            candidates.push((candidate.as_str(), score));
        }
    }

    // Sort: score asc, depois alfabetico pra desempatar.
    candidates.sort_by(|a, b| a.1.cmp(&b.1).then_with(|| a.0.cmp(b.0)));
    candidates
        .into_iter()
        .take(MAX_SUGGESTIONS)
        .map(|(w, _)| w.to_string())
        .collect()
}

/// Conta caracteres iniciais identicos entre dois slices. Usado como
/// bonus de scoring — palavras com prefixo igual sao mais provaveis
/// de ser a "intencao real" do user que palavras com primeira letra
/// trocada.
fn shared_prefix_len(a: &[char], b: &[char]) -> usize {
    let mut i = 0;
    while i < a.len() && i < b.len() && a[i] == b[i] {
        i += 1;
    }
    i
}

/// Remove acentos/cedilha de um caractere pt-BR. Mapping manual cobre
/// os casos comuns sem precisar de unicode-normalization (que adiciona
/// dependencia + custo). Caracteres nao-mapeados retornam tal qual.
fn strip_accent(c: char) -> char {
    match c {
        'á' | 'à' | 'â' | 'ã' | 'ä' => 'a',
        'Á' | 'À' | 'Â' | 'Ã' | 'Ä' => 'A',
        'é' | 'è' | 'ê' | 'ë' => 'e',
        'É' | 'È' | 'Ê' | 'Ë' => 'E',
        'í' | 'ì' | 'î' | 'ï' => 'i',
        'Í' | 'Ì' | 'Î' | 'Ï' => 'I',
        'ó' | 'ò' | 'ô' | 'õ' | 'ö' => 'o',
        'Ó' | 'Ò' | 'Ô' | 'Õ' | 'Ö' => 'O',
        'ú' | 'ù' | 'û' | 'ü' => 'u',
        'Ú' | 'Ù' | 'Û' | 'Ü' => 'U',
        'ç' => 'c',
        'Ç' => 'C',
        'ñ' => 'n',
        'Ñ' => 'N',
        c => c,
    }
}

/// Adiciona palavra ao dicionario em memoria (dict pessoal). O facade
/// JS persiste em localStorage e re-emite essa command no startup,
/// entao a palavra "fica" entre sessoes apesar do RwLock voltar pro
/// estado inicial em cada inicializacao.
#[tauri::command]
pub fn spell_add(word: String) {
    let lower = word.to_lowercase();
    if let Ok(mut p) = PERSONAL.write() {
        p.insert(lower);
    }
}

/// Remove palavra do dict pessoal (caso futuro: settings > dicionario
/// pessoal). NAO afeta as palavras do .dic — so' tira o que foi
/// adicionado em runtime.
#[tauri::command]
pub fn spell_remove(word: String) {
    let lower = word.to_lowercase();
    if let Ok(mut p) = PERSONAL.write() {
        p.remove(&lower);
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
