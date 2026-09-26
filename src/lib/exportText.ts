/**
 * Texto de um trecho de HTML cru do Markdown, para a exportação em DOCX e
 * PDF, que não levam imagem: a imagem vira o mesmo marcador que o
 * `![alt](src)` recebe. A imagem redimensionada é salva como `<img>` e,
 * sem isso, sumia do arquivo exportado.
 */
export function htmlAsPlainText(value: string): string {
  return value
    .replace(/<img\b[^>]*>/gi, (tag) => {
      const alt = tag.match(/\balt\s*=\s*"([^"]*)"/i)?.[1]?.trim();
      return alt ? ` [imagem: ${decodeBasicEntities(alt)}] ` : " [imagem] ";
    })
    .replace(/<[^>]*>/g, " ");
}

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
