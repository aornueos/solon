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
const SPLIT_HEADS: &[&str] = &[
    "a", "à", "ao", "aos", "às", "com", "da", "das", "de", "do", "dos", "em", "na", "nas", "no",
    "nos", "num", "numa", "para", "pela", "pelo", "por", "pra", "que", "se", "sem", "um", "uma",
];

pub struct Dictionary<'a> {
    /// Ordenada por bytes e sem repetição (pré-requisito da busca binária
    /// e do percurso por prefixo).
    words: Vec<&'a str>,
    /// Maior palavra, em caracteres — dimensiona a tabela de distância.
    max_chars: usize,
}

impl<'a> Dictionary<'a> {
    /// Uma palavra por linha. Entradas com qualquer coisa que não seja
    /// letra (abreviações como "voc.", hífen, apóstrofo) ficam de fora: o
    /// editor só checa sequências de letras, então elas nunca seriam
    /// consultadas e só apareceriam como sugestão estranha.
    pub fn from_lines(data: &'a str) -> Self {
        let mut words: Vec<&'a str> = data
            .lines()
            .map(str::trim)
            .filter(|w| !w.is_empty() && w.chars().all(char::is_alphabetic))
            .collect();
        // O gerador grava em ordem de `localeCompare`, que não é a ordem de
        // bytes. Só ordena se precisar.
        if !words.windows(2).all(|pair| pair[0] <= pair[1]) {
            words.sort_unstable();
        }
        words.dedup();
        let max_chars = words.iter().map(|w| w.chars().count()).max().unwrap_or(0);
        Self { words, max_chars }
    }

    pub fn len(&self) -> usize {
        self.words.len()
    }

    pub fn contains(&self, word: &str) -> bool {
        self.words.binary_search(&word).is_ok()
    }

    /// Até `MAX_SUGGESTIONS` correções para `typed` (minúsculo), da mais
    /// provável para a menos.
    pub fn suggest(&self, typed: &str) -> Vec<String> {
        let target: Vec<char> = typed.chars().collect();
        if target.is_empty() {
            return Vec::new();
        }
        let limit = max_cost_for(target.len());
        let mut found: Vec<Candidate> = self.edit_candidates(&target, limit);
        found.extend(self.split_candidates(&target));

        let first = target[0];
        found.sort_by(|a, b| {
            a.cost
                .cmp(&b.cost)
                .then_with(|| a.differs_at_start(first).cmp(&b.differs_at_start(first)))
                .then_with(|| a.len_gap(target.len()).cmp(&b.len_gap(target.len())))
                .then_with(|| a.text.cmp(&b.text))
        });
        found.dedup_by(|a, b| a.text == b.text);

        let best = match found.first() {
            Some(c) => c.cost,
            None => return Vec::new(),
        };
        found
            .into_iter()
            .take_while(|c| c.cost < best + RELATIVE_CUTOFF)
            .take(MAX_SUGGESTIONS)
            .map(|c| c.text)
            .collect()
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
            for &known in SPLIT_HEADS {
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
                });
            }
        }
        out
    }
}

struct Candidate {
    text: String,
    cost: u32,
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
