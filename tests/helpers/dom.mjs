// DOM de verdade para os testes que passam pelo editor. Tem de ser o
// primeiro import do arquivo de teste: o DOMPurify e o ProseMirror leem
// `window` quando o módulo carrega.
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const { window } = dom;

for (const key of [
  "window",
  "document",
  "navigator",
  "Node",
  "Element",
  "HTMLElement",
  "Text",
  "DocumentFragment",
  "DOMParser",
  "MutationObserver",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "getSelection",
  "KeyboardEvent",
  "MouseEvent",
  "ClipboardEvent",
  "InputEvent",
  "localStorage",
]) {
  if (key === "window") {
    globalThis.window = window;
    continue;
  }
  const value = window[key];
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value: typeof value === "function" && !/^[A-Z]/.test(key) ? value.bind(window) : value,
  });
}
// O ProseMirror mede posições com esses; o jsdom não faz layout.
window.document.createRange = window.document.createRange.bind(window.document);
window.Element.prototype.getClientRects = () => [];
window.Element.prototype.getBoundingClientRect = () => ({
  x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0,
});
