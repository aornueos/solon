//! Motor do corretor ortográfico: dicionário e sugestões.
//!
//! Separado de `spellcheck.rs` (que só expõe os comandos do Tauri) para
//! poder ser testado com `cargo test` sem subir o app.
//!
//! O dicionário é a lista de formas pt-BR gerada por
//! `scripts/copy-spellcheck-dict.cjs` — ~2,8 milhões de palavras já
//! flexionadas. Fica numa única `Vec<&str>` ordenada por bytes, apontando
//! para o texto embutido no binário: nenhuma cópia por palavra.
//!
//! Sugestões: a lista ordenada é percorrida como uma árvore de prefixos.
//! Palavras vizinhas compartilham o começo, então as linhas da tabela de
//! distância calculadas para "casament" servem para "casamento" e
//! "casamentos"; e quando um prefixo já custa mais que o limite, todas as
//! palavras que começam com ele são puladas de uma vez por busca binária.
//!
//! A distância é ponderada para os erros de quem escreve em português:
//! acento esquecido, letra dobrada, s/z/ç, xc/sc, h mudo, letras trocadas
//! de lugar e teclas vizinhas custam menos que uma troca qualquer. Custos
//! em centésimos de edição (100 = uma edição comum).
//!
//! Na ordenação entra também a frequência de uso da palavra, quando há
//! lista de frequência: entre candidatas à mesma distância, a palavra
//! comum vem antes da flexão rara.
//!
//! Há um dicionário por idioma (português e inglês). Com mais de um
//! ativo, a palavra vale se estiver em qualquer um, e as sugestões dos
//! dois disputam o mesmo ranking (`suggest_in`). O primeiro da lista é o
//! principal: palavra que só o outro conhece mas que é uma palavra do
//! principal sem acento ("voce", "mes", "tres") continua sendo erro.

use std::collections::{HashMap, HashSet};

/// Troca comum: vale uma edição.
const EDIT: u32 = 100;
/// Mesma letra com outro acento (a/á/ã, e/ê, c/ç).
const ACCENT: u32 = 25;
/// Letra dobrada a mais ou a menos (pesoa/pessoa, excessão).
const DOUBLED: u32 = 40;
/// Letra muda ou de dígrafo que some ao digitar (h, xc, sc, qu, gu).
const SILENT: u32 = 50;
/// Duas letras vizinhas trocadas de lugar (masi/mais) — o erro de
/// digitação mais comum, mais barato que uma troca pelo som.
const TRANSPOSE: u32 = 50;
/// Tecla vizinha no teclado.
const KEYBOARD: u32 = 75;
/// Separar duas palavras coladas (porisso → por isso).
const SPLIT: u32 = 45;
/// Separar quando a primeira parte é uma letra só ("apartir" → "a
/// partir"). Mais caro: "atraz" é "atrás", não "a traz".
const SPLIT_SINGLE: u32 = 80;

/// Quantas sugestões no máximo. Mais que isso vira ruído no menu.
pub const MAX_SUGGESTIONS: usize = 4;
/// Só entra quem fica a menos desta distância da melhor sugestão: uma
/// correção óbvia não vem acompanhada de palpites distantes.
const RELATIVE_CUTOFF: u32 = 50;

/// Palavras curtas que costumam aparecer coladas na seguinte.
pub const PORTUGUESE_SPLIT_HEADS: &[&str] = &[
    "a", "à", "ao", "aos", "às", "com", "da", "das", "de", "do", "dos", "em", "na", "nas", "no",
    "nos", "num", "numa", "para", "pela", "pelo", "por", "pra", "que", "se", "sem", "um", "uma",
];

/// O mesmo em inglês: "alot" → "a lot", "infact" → "in fact".
pub const ENGLISH_SPLIT_HEADS: &[&str] = &[
    "a", "an", "any", "at", "each", "every", "in", "no", "of", "on", "some", "to",
];

/// Bônus de quem está na lista de frequência (palavra de uso real), mais
/// uma parte que cresce com o uso. Em centésimos de edição, como o custo.
const FREQUENT_BASE: i32 = 20;
const FREQUENT_SCALE: f64 = 20.0;

pub struct Dictionary<'a> {
    /// Ordenada por bytes e sem repetição (pré-requisito da busca binária
    /// e do percurso por prefixo).
    words: Vec<&'a str>,
    /// Maior palavra, em caracteres — dimensiona a tabela de distância.
    max_chars: usize,
    /// Posição de cada palavra na lista de frequência (1 = mais usada).
    frequency: HashMap<&'a str, u32>,
    /// Palavras curtas que o usuário cola na seguinte, neste idioma.
    split_heads: &'a [&'a str],
}

impl<'a> Dictionary<'a> {
    /// Uma palavra por linha. Entradas com qualquer coisa que não seja
    /// letra (abreviações como "voc.", hífen) ficam de fora: o editor só
    /// checa sequências de letras, então elas nunca seriam consultadas e
    /// só apareceriam como sugestão estranha. O apóstrofo no meio da
    /// palavra fica ("don't", "d'água").
    pub fn from_lines(data: &'a str) -> Self {
        let mut words: Vec<&'a str> = data
            .lines()
            .map(str::trim)
            .filter(|w| is_word_shape(w))
            .collect();
        // O gerador grava em ordem de `localeCompare`, que não é a ordem de
        // bytes. Só ordena se precisar.
        if !words.windows(2).all(|pair| pair[0] <= pair[1]) {
            words.sort_unstable();
        }
        words.dedup();
        let max_chars = words.iter().map(|w| w.chars().count()).max().unwrap_or(0);
        Self {
            words,
            max_chars,
            frequency: HashMap::new(),
            split_heads: PORTUGUESE_SPLIT_HEADS,
        }
    }

    /// Troca as palavras curtas usadas para separar palavras coladas.
    pub fn with_split_heads(mut self, heads: &'a [&'a str]) -> Self {
        self.split_heads = heads;
        self
    }

    /// Lista de frequência: uma palavra por linha, da mais usada para a
    /// menos (o que vem depois da palavra na linha é ignorado; linhas com
    /// `#` são comentário). Sem ela a sugestão desempata por ordem
    /// alfabética, e uma flexão rara ("aguá") ganha da palavra comum
    /// ("água") quando as duas estão à mesma distância.
    pub fn with_frequency(mut self, data: &'a str) -> Self {
        let mut rank = 0u32;
        for line in data.lines() {
            let word = line.split_whitespace().next().unwrap_or("");
            if word.is_empty() || word.starts_with('#') {
                continue;
            }
            rank += 1;
            self.frequency.entry(word).or_insert(rank);
        }
        self
    }

    /// Quanto a frequência abate do custo na ordenação.
    fn frequency_bonus(&self, word: &str) -> i32 {
        let Some(&rank) = self.frequency.get(word) else {
            return 0;
        };
        let total = self.frequency.len().max(1) as f64 + 1.0;
        let usage = 1.0 - (rank as f64).ln() / total.ln();
        FREQUENT_BASE + (FREQUENT_SCALE * usage.max(0.0)).round() as i32
    }

    fn score(&self, text: &str, cost: u32) -> i32 {
        let bonus = text
            .split(' ')
            .map(|part| self.frequency_bonus(part))
            .min()
            .unwrap_or(0);
        cost as i32 - bonus
    }

    pub fn len(&self) -> usize {
        self.words.len()
    }

    pub fn contains(&self, word: &str) -> bool {
        self.words.binary_search(&word).is_ok()
    }

    /// Existe aqui a mesma palavra com um ou dois acentos (ou ç) que
    /// faltaram ao digitar? "voce" → "você", "informacao" → "informação".
    fn has_accented_form(&self, word: &str) -> bool {
        let mut chars: Vec<char> = word.chars().collect();
        let slots: Vec<(usize, &[char])> = chars
            .iter()
            .enumerate()
            .filter_map(|(i, &c)| accented_forms(c).map(|forms| (i, forms)))
            .collect();
        let mut buf = String::with_capacity(word.len() + 8);
        let mut hit = |chars: &[char]| {
            buf.clear();
            buf.extend(chars);
            self.contains(&buf)
        };
        for (a, &(pos_a, forms_a)) in slots.iter().enumerate() {
            let plain_a = chars[pos_a];
            for &form_a in forms_a {
                chars[pos_a] = form_a;
                if hit(&chars) {
                    return true;
                }
                for &(pos_b, forms_b) in &slots[a + 1..] {
                    let plain_b = chars[pos_b];
                    for &form_b in forms_b {
                        chars[pos_b] = form_b;
                        if hit(&chars) {
                            return true;
                        }
                    }
                    chars[pos_b] = plain_b;
                }
            }
            chars[pos_a] = plain_a;
        }
        false
    }

    /// Até `MAX_SUGGESTIONS` correções para `typed` (minúsculo), da mais
    /// provável para a menos, só deste dicionário. O app usa `suggest_in`.
    #[cfg(test)]
    pub fn suggest(&self, typed: &str) -> Vec<String> {
        suggest_in(&[self], typed)
    }

    /// Candidatas deste dicionário, já com a pontuação (custo abatido pela
    /// frequência).
    fn scored_candidates(&self, target: &[char]) -> Vec<Candidate> {
        let limit = max_cost_for(target.len());
        let mut found: Vec<Candidate> = self.edit_candidates(target, limit);
        found.extend(self.split_candidates(target));
        for candidate in &mut found {
            candidate.score = self.score(&candidate.text, candidate.cost);
        }
        found
    }

    /// Percorre a lista ordenada reaproveitando as linhas da tabela entre
    /// palavras de mesmo prefixo e pulando prefixos que já estouraram o
    /// limite.
    fn edit_candidates(&self, target: &[char], limit: u32) -> Vec<Candidate> {
        let cols = target.len() + 1;
        // rows[i * cols + j]: custo de transformar os i primeiros caracteres
        // da palavra do dicionário nos j primeiros do digitado.
        let mut rows = vec![0u32; (self.max_chars + 1) * cols];
        for j in 1..cols {
            rows[j] = rows[j - 1] + insert_cost(target, j - 1);
        }
        // Menor valor de cada linha, para o piso da poda.
        let mut row_mins = vec![0u32; self.max_chars + 1];
        // Linhas válidas para o prefixo atual (a linha 0 sempre vale). A
        // linha i usa o caractere seguinte da palavra como contexto, então
        // só vale para quem compartilha i + 1 caracteres.
        let mut valid_rows = 1usize;
        let mut previous: Vec<char> = Vec::new();
        let mut current: Vec<char> = Vec::with_capacity(self.max_chars);
        let mut out = Vec::new();

        let mut idx = 0;
        while idx < self.words.len() {
            let word = self.words[idx];
            current.clear();
            current.extend(word.chars());
            let shared = shared_prefix(&previous, &current);
            valid_rows = valid_rows.min(shared.max(1));

            let mut pruned_at = None;
            let first_stale = valid_rows;
            for i in first_stale..=current.len() {
                let row_min = fill_row(&mut rows, cols, i, &current, target);
                // Toda célula das linhas seguintes vem da linha i (custo não
                // negativo) ou, por transposição, da i - 1 somando
                // TRANSPOSE. Logo nenhuma fica abaixo deste piso, e se ele
                // passou do limite o prefixo inteiro está descartado.
                let floor = row_min.min(row_mins[i - 1] + TRANSPOSE);
                row_mins[i] = row_min;
                if floor > limit {
                    pruned_at = Some(i);
                    break;
                }
                valid_rows = i + 1;
            }

            std::mem::swap(&mut previous, &mut current);
            match pruned_at {
                Some(i) if i < previous.len() => {
                    // Ninguém que comece com estes i + 1 caracteres chega ao
                    // limite: pula o bloco inteiro de uma vez.
                    let prefix_bytes: usize = previous[..=i].iter().map(|c| c.len_utf8()).sum();
                    let prefix = &word[..prefix_bytes];
                    let rest = &self.words[idx..];
                    idx += rest.partition_point(|w| w.starts_with(prefix)).max(1);
                    valid_rows = valid_rows.min(i);
                }
                Some(_) => idx += 1,
                None => {
                    let cost = rows[previous.len() * cols + target.len()];
                    if cost <= limit {
                        out.push(Candidate {
                            text: word.to_string(),
                            cost,
                            score: 0,
                        });
                    }
                    idx += 1;
                }
            }
        }
        out
    }

    /// "porisso" → "por isso", "derrepente" → "de repente",
    /// "concerteza" → "com certeza".
    fn split_candidates(&self, target: &[char]) -> Vec<Candidate> {
        let mut out = Vec::new();
        if target.len() < 4 {
            return out;
        }
        for cut in 1..target.len() - 1 {
            let head: String = target[..cut].iter().collect();
            let mut tail = &target[cut..];
            // "derrepente": o r dobrado era só para manter o som colado.
            if tail.len() > 2 && tail[0] == tail[1] && matches!(tail[0], 'r' | 's') {
                tail = &tail[1..];
            }
            let tail: String = tail.iter().collect();
            if tail.chars().count() < 2 || !self.contains(&tail) {
                continue;
            }
            for &known in self.split_heads {
                let extra = if known == head {
                    0
                } else if near_head(known, &head) {
                    ACCENT
                } else {
                    continue;
                };
                let base = if cut == 1 { SPLIT_SINGLE } else { SPLIT };
                out.push(Candidate {
                    text: format!("{known} {tail}"),
                    cost: base + extra,
                    score: 0,
                });
            }
        }
        out
    }
}

/// Sugestões juntando os dicionários ativos: a palavra que existe nos
/// dois entra uma vez só, com a melhor pontuação.
pub fn suggest_in(dicts: &[&Dictionary<'_>], typed: &str) -> Vec<String> {
    let target: Vec<char> = typed.chars().collect();
    if target.is_empty() {
        return Vec::new();
    }
    let mut found: Vec<Candidate> = dicts
        .iter()
        .flat_map(|dict| dict.scored_candidates(&target))
        .collect();

    let first = target[0];
    found.sort_by(|a, b| {
        a.score
            .cmp(&b.score)
            .then_with(|| a.differs_at_start(first).cmp(&b.differs_at_start(first)))
            .then_with(|| a.len_gap(target.len()).cmp(&b.len_gap(target.len())))
            .then_with(|| a.text.cmp(&b.text))
    });
    // A mesma sugestão pode vir de dois caminhos (dois dicionários, ou dois
    // cortes de palavras coladas) com pontuações diferentes, então não fica
    // necessariamente vizinha na ordenação: fica a primeira, a melhor.
    // A própria palavra digitada pode vir de um dicionário que a conhece
    // ("voce" no inglês) — sugerir ela mesma não corrige nada.
    let mut seen = HashSet::new();
    found.retain(|c| c.text != typed && seen.insert(c.text.clone()));

    let best = match found.first() {
        Some(c) => c.score,
        None => return Vec::new(),
    };
    found
        .into_iter()
        .take_while(|c| c.score < best + RELATIVE_CUTOFF as i32)
        .take(MAX_SUGGESTIONS)
        .map(|c| c.text)
        .collect()
}

/// A palavra (minúscula, apóstrofo reto) está certa em algum dicionário
/// ativo ou no pessoal? Com apóstrofo, basta a palavra inteira existir
/// ("don't") ou cada parte dela ("d'água" = "d" + "água"): as partes de
/// até duas letras são a elisão ("d", "l", "t", "re") e não são checadas.
///
/// `dicts[0]` é o idioma principal. Uma palavra que só os outros conhecem
/// não vale se for uma palavra do principal sem acento: com português e
/// inglês ativos, "voce", "mes" e "tres" (que o dicionário inglês traz)
/// continuam sublinhadas.
pub fn is_known(dicts: &[&Dictionary<'_>], word: &str, personal: impl Fn(&str) -> bool) -> bool {
    let known = |w: &str| {
        if personal(w) {
            return true;
        }
        match dicts.split_first() {
            Some((main, others)) => {
                main.contains(w)
                    || (others.iter().any(|d| d.contains(w)) && !main.has_accented_form(w))
            }
            None => false,
        }
    };
    if known(word) {
        return true;
    }
    word.contains('\'')
        && word
            .split('\'')
            .all(|part| part.chars().count() <= 2 || known(part))
}

/// Letras, com apóstrofo reto só entre letras.
fn is_word_shape(word: &str) -> bool {
    !word.is_empty()
        && word
            .split('\'')
            .all(|part| !part.is_empty() && part.chars().all(char::is_alphabetic))
}

struct Candidate {
    text: String,
    cost: u32,
    /// Custo abatido pela frequência — é por ele que se ordena.
    score: i32,
}

impl Candidate {
    fn differs_at_start(&self, first: char) -> bool {
        match self.text.chars().next() {
            Some(c) => strip_accent(c) != strip_accent(first),
            None => true,
        }
    }

    fn len_gap(&self, len: usize) -> usize {
        self.text.chars().count().abs_diff(len)
    }
}

/// Limite de distância por tamanho. Palavras curtas aceitam menos erro:
/// em "voa" quase tudo está a duas edições. Nas longas, 1,5 edição já
/// cobre os erros reais (os típicos custam menos que uma edição inteira)
/// e poda muito mais cedo: com 2, qualquer prefixo de duas letras
/// erradas continuava vivo e a busca varria centenas de milhares de
/// palavras.
fn max_cost_for(len: usize) -> u32 {
    match len {
        0..=3 => EDIT,
        _ => EDIT + EDIT / 2,
    }
}

/// Calcula a linha `i` (palavra do dicionário consumida até o caractere
/// i) e devolve o menor valor dela.
fn fill_row(rows: &mut [u32], cols: usize, i: usize, word: &[char], target: &[char]) -> u32 {
    let (before, after) = rows.split_at_mut(i * cols);
    let up = &before[(i - 1) * cols..];
    let up2 = if i >= 2 {
        Some(&before[(i - 2) * cols..(i - 1) * cols])
    } else {
        None
    };
    let row = &mut after[..cols];

    let del = delete_cost(word, i - 1);
    row[0] = up[0] + del;
    let mut row_min = row[0];
    let w = word[i - 1];
    for j in 1..cols {
        let t = target[j - 1];
        let mut best = (up[j - 1] + substitute_cost(w, t))
            .min(up[j] + del)
            .min(row[j - 1] + insert_cost(target, j - 1));
        if let Some(up2) = up2 {
            if j >= 2 && w != t && w == target[j - 2] && word[i - 2] == t {
                best = best.min(up2[j - 2] + TRANSPOSE);
            }
        }
        row[j] = best;
        row_min = row_min.min(best);
    }
    row_min
}

/// Custo de a palavra certa ter `word[k]` e o digitado não.
fn delete_cost(word: &[char], k: usize) -> u32 {
    let c = word[k];
    let prev = k.checked_sub(1).map(|p| word[p]);
    let next = word.get(k + 1).copied();
    if prev == Some(c) {
        return DOUBLED;
    }
    match (prev, c, next) {
        (_, 'h', _) => SILENT,
        (_, 's' | 'x', Some('c')) => SILENT,
        (Some('s' | 'x'), 'c', _) => SILENT,
        (Some('q' | 'g'), 'u', _) => SILENT,
        _ => EDIT,
    }
}

/// Custo de o digitado ter `target[j]` sobrando.
fn insert_cost(target: &[char], j: usize) -> u32 {
    let c = target[j];
    let prev = j.checked_sub(1).map(|p| target[p]);
    let next = target.get(j + 1).copied();
    if prev == Some(c) {
        return DOUBLED;
    }
    match (prev, c, next) {
        (_, 'h', _) => SILENT,
        (_, 's' | 'x', Some('c')) => SILENT,
        (Some('s' | 'x'), 'c', _) => SILENT,
        _ => EDIT,
    }
}

fn substitute_cost(a: char, b: char) -> u32 {
    if a == b {
        return 0;
    }
    let (fa, fb) = (strip_accent(a), strip_accent(b));
    if fa == fb {
        return ACCENT;
    }
    // Trocas pela pronúncia. O acento não soma custo extra aqui: "ansiozo"
    // e "ansiôso" erram do mesmo jeito.
    let (lo, hi) = if fa < fb { (fa, fb) } else { (fb, fa) };
    let sound = match (lo, hi) {
        ('s', 'z') | ('g', 'j') | ('m', 'n') | ('c', 'k') => 50,
        ('c', 's') | ('s', 'x') | ('e', 'i') | ('o', 'u') => 60,
        ('l', 'u') | ('x', 'z') | ('c', 'q') | ('k', 'q') => 70,
        _ => EDIT,
    };
    // `ç` já virou `c` em strip_accent; "ç" por "s" é a troca mais comum.
    let sound = if (a == 'ç' || b == 'ç') && (fa == 's' || fb == 's') {
        40
    } else {
        sound
    };
    if sound < EDIT {
        return sound;
    }
    if keyboard_neighbors(fa, fb) {
        KEYBOARD
    } else {
        EDIT
    }
}

/// Vizinhos no teclado QWERTY/ABNT2 (mesma disposição das letras).
fn keyboard_neighbors(a: char, b: char) -> bool {
    const ROWS: [&str; 3] = ["qwertyuiop", "asdfghjklç", "zxcvbnm"];
    let pos = |c: char| {
        ROWS.iter().enumerate().find_map(|(r, row)| {
            row.chars()
                .position(|x| x == c)
                .map(|col| (r as i32, col as i32))
        })
    };
    match (pos(a), pos(b)) {
        // Na mesma linha, lado a lado; nas vizinhas, a coluna igual ou a
        // da diagonal (as fileiras são deslocadas meia tecla).
        (Some((ra, ca)), Some((rb, cb))) => match rb - ra {
            0 => (ca - cb).abs() == 1,
            1 => cb == ca || cb == ca - 1,
            -1 => cb == ca || cb == ca + 1,
            _ => false,
        },
        _ => false,
    }
}

/// Cabeça digitada que é uma variação de uma palavra curta conhecida:
/// mesma extensão, um único caractere diferente, e a troca é de acento ou
/// m/n ("con" por "com", "a" por "à").
fn near_head(known: &str, typed: &str) -> bool {
    let (k, t): (Vec<char>, Vec<char>) = (known.chars().collect(), typed.chars().collect());
    if k.len() != t.len() {
        return false;
    }
    let diffs: Vec<(char, char)> = k
        .iter()
        .zip(&t)
        .filter(|(a, b)| a != b)
        .map(|(a, b)| (*a, *b))
        .collect();
    match diffs.as_slice() {
        [(a, b)] => {
            strip_accent(*a) == strip_accent(*b) || matches!((a, b), ('m', 'n') | ('n', 'm'))
        }
        _ => false,
    }
}

/// Formas acentuadas do português para uma letra sem acento.
fn accented_forms(c: char) -> Option<&'static [char]> {
    match c {
        'a' => Some(&['á', 'â', 'ã']),
        'e' => Some(&['é', 'ê']),
        'i' => Some(&['í']),
        'o' => Some(&['ó', 'ô', 'õ']),
        'u' => Some(&['ú']),
        'c' => Some(&['ç']),
        _ => None,
    }
}

fn shared_prefix(a: &[char], b: &[char]) -> usize {
    a.iter().zip(b).take_while(|(x, y)| x == y).count()
}

/// Remove acento e cedilha de uma letra minúscula do português.
pub fn strip_accent(c: char) -> char {
    match c {
        'á' | 'à' | 'â' | 'ã' | 'ä' => 'a',
        'é' | 'è' | 'ê' | 'ë' => 'e',
        'í' | 'ì' | 'î' | 'ï' => 'i',
        'ó' | 'ò' | 'ô' | 'õ' | 'ö' => 'o',
        'ú' | 'ù' | 'û' | 'ü' => 'u',
        'ç' => 'c',
        'ñ' => 'n',
        c => c,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const WORDS: &str = "\
casa\ncasas\ncais\ncasamento\nvazamento\ncatamento\nvocê\nvoe\ndoce\ntambém\ntampem\n\
pessoa\npeso\npesos\nexceção\nexação\nexerção\nexcessivo\nrecessivo\nconsciência\n\
concrescia\nansioso\nansiosa\nansiedade\nsociedade\nmenino\nmini\ntravesseiro\n\
travessia\nrepente\nde\nisso\npor\npoço\ncerteza\ncom\nhoje\nvoc.\n";

    fn dict() -> Dictionary<'static> {
        Dictionary::from_lines(WORDS)
    }

    fn first(word: &str) -> Option<String> {
        dict().suggest(word).into_iter().next()
    }

    #[test]
    fn acento_esquecido_vem_primeiro() {
        assert_eq!(first("voce").as_deref(), Some("você"));
        assert_eq!(first("tambem").as_deref(), Some("também"));
    }

    #[test]
    fn erros_comuns_de_portugues() {
        assert_eq!(first("pesoa").as_deref(), Some("pessoa"));
        assert_eq!(first("cazamento").as_deref(), Some("casamento"));
        assert_eq!(first("exeção").as_deref(), Some("exceção"));
        assert_eq!(first("ecessivo").as_deref(), Some("excessivo"));
        assert_eq!(first("conciencia").as_deref(), Some("consciência"));
        assert_eq!(first("ansiozo").as_deref(), Some("ansioso"));
        assert_eq!(first("anciedade").as_deref(), Some("ansiedade"));
        assert_eq!(first("mininu").as_deref(), Some("menino"));
        assert_eq!(first("traveseiro").as_deref(), Some("travesseiro"));
        assert_eq!(first("oje").as_deref(), Some("hoje"));
    }

    #[test]
    fn letras_trocadas_de_lugar() {
        assert_eq!(first("caas").as_deref(), Some("casa"));
    }

    #[test]
    fn frequencia_desempata_a_favor_da_palavra_comum() {
        // "aguá" (flexão de aguar) e "água" estão à mesma distância de
        // "agua"; sem frequência a ordem alfabética punha "aguá" antes.
        let d = Dictionary::from_lines("aguá\nágua\ncaãs\ncasa\n")
            .with_frequency("# comentário\ncasa 10\nágua 5\n");
        assert_eq!(d.suggest("agua").first().map(String::as_str), Some("água"));
        assert_eq!(d.suggest("caas").first().map(String::as_str), Some("casa"));
    }

    #[test]
    fn transposicao_vence_troca_pelo_som() {
        let d = Dictionary::from_lines("mais\nmaxi\n");
        assert_eq!(d.suggest("masi").first().map(String::as_str), Some("mais"));
    }

    #[test]
    fn cabeca_de_uma_letra_nao_atropela_correcao() {
        let d = Dictionary::from_lines("atrás\ntraz\npartir\n");
        assert_eq!(
            d.suggest("atraz").first().map(String::as_str),
            Some("atrás")
        );
        assert_eq!(
            d.suggest("apartir").first().map(String::as_str),
            Some("a partir")
        );
    }

    #[test]
    fn palavras_coladas_viram_duas() {
        assert_eq!(first("porisso").as_deref(), Some("por isso"));
        assert_eq!(first("derrepente").as_deref(), Some("de repente"));
        assert_eq!(first("concerteza").as_deref(), Some("com certeza"));
    }

    #[test]
    fn no_maximo_quatro_e_so_as_proximas_da_melhor() {
        let d = dict();
        for word in ["casx", "voce", "pesoa", "cazamento"] {
            assert!(d.suggest(word).len() <= MAX_SUGGESTIONS, "{word}");
        }
        // Com "você" a um acento, nada a uma edição inteira entra junto.
        assert_eq!(d.suggest("voce"), vec!["você".to_string()]);
    }

    #[test]
    fn abreviacao_nao_entra_no_dicionario() {
        let d = dict();
        assert!(!d.contains("voc."));
        assert!(d.suggest("voc").iter().all(|s| !s.contains('.')));
    }

    #[test]
    fn dicionario_fora_de_ordem_e_ordenado() {
        let d = Dictionary::from_lines("zebra\nabacaxi\nmelão\nabacaxi\n");
        assert_eq!(d.len(), 3);
        assert!(d.contains("melão"));
        assert!(d.contains("zebra"));
    }

    #[test]
    fn contracao_com_apostrofo_entra_no_dicionario() {
        let d = Dictionary::from_lines("don't\n'tis\nrock'\ndon\nágua\n");
        assert!(d.contains("don't"));
        assert!(!d.contains("'tis"));
        assert!(!d.contains("rock'"));
    }

    #[test]
    fn palavra_com_apostrofo_vale_inteira_ou_por_partes() {
        let en = Dictionary::from_lines("don't\nisn't\nwater\n");
        let pt = Dictionary::from_lines("água\narco\n");
        let nobody = |_: &str| false;
        assert!(is_known(&[&en], "isn't", nobody));
        // Só português ativo: contração inglesa é erro.
        assert!(!is_known(&[&pt], "isn't", nobody));
        // Elisão do português: "d" não é checado, "água" sim.
        assert!(is_known(&[&pt], "d'água", nobody));
        assert!(!is_known(&[&pt], "d'ágau", nobody));
        assert!(is_known(&[&pt], "zorvanek", |w| w == "zorvanek"));
    }

    #[test]
    fn dois_idiomas_disputam_o_mesmo_ranking() {
        let en = Dictionary::from_lines("house\nhorse\n")
            .with_frequency("house\nhorse\n")
            .with_split_heads(ENGLISH_SPLIT_HEADS);
        let pt = Dictionary::from_lines("casa\nhouse\n");
        // Inglês ativo: a sugestão vem do inglês.
        assert_eq!(suggest_in(&[&pt, &en], "hause").first().map(String::as_str), Some("house"));
        // Palavra nos dois dicionários aparece uma vez só.
        let both = suggest_in(&[&pt, &en], "hause");
        assert_eq!(both.iter().filter(|s| *s == "house").count(), 1);
        // Português continua sugerindo o que é dele.
        assert_eq!(suggest_in(&[&pt, &en], "caza").first().map(String::as_str), Some("casa"));
    }

    #[test]
    fn com_dois_idiomas_palavra_sem_acento_do_principal_continua_erro() {
        let pt = Dictionary::from_lines("você\nárea\ninformação\ncasa\n");
        let en = Dictionary::from_lines("voce\narea\nhouse\ninformacao\n");
        let nobody = |_: &str| false;
        for typo in ["voce", "area", "informacao"] {
            assert!(!is_known(&[&pt, &en], typo, nobody), "{typo}");
            // Só inglês: vale.
            assert!(is_known(&[&en], typo, nobody), "{typo}");
        }
        // Palavra só inglesa, que não é português sem acento, vale.
        assert!(is_known(&[&pt, &en], "house", nobody));
        // E a sugestão é a forma com acento, não a própria palavra.
        let got = suggest_in(&[&pt, &en], "voce");
        assert_eq!(got.first().map(String::as_str), Some("você"));
        assert!(!got.iter().any(|s| s == "voce"));
    }

    #[test]
    fn palavras_coladas_em_ingles() {
        let en = Dictionary::from_lines("fact\nleast\nlot\n").with_split_heads(ENGLISH_SPLIT_HEADS);
        assert_eq!(en.suggest("infact").first().map(String::as_str), Some("in fact"));
        assert_eq!(en.suggest("atleast").first().map(String::as_str), Some("at least"));
        // As cabeças do português não valem no inglês.
        let en_only = Dictionary::from_lines("isso\n").with_split_heads(ENGLISH_SPLIT_HEADS);
        assert!(en_only.suggest("porisso").iter().all(|s| s != "por isso"));
    }

    #[test]
    fn poda_por_prefixo_nao_perde_candidatos() {
        // Força a busca a pular blocos: muitos prefixos inviáveis antes e
        // depois do alvo.
        let mut lines = String::new();
        for a in 'a'..='z' {
            for b in 'a'..='z' {
                lines.push_str(&format!("{a}{b}xyzw\n"));
            }
        }
        lines.push_str("pessoa\n");
        let d = Dictionary::from_lines(Box::leak(lines.into_boxed_str()));
        assert_eq!(d.suggest("pesoa"), vec!["pessoa".to_string()]);
    }
}
