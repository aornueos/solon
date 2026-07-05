document.documentElement.classList.add("ready");

const previewCopy = {
  free: {
    title: "modo livre - capitulo-03.md",
    caption: "Modo livre: rascunho fluido, arquivos e referências sem moldura de página.",
  },
  page: {
    title: "visualização de página - capitulo-03.md",
    caption: "Visualização de página: a escrita aparece como folha para revisão editorial.",
  },
  canvas: {
    title: "canvas - capitulo-03.md",
    caption: "Canvas: cenas, cartões e relações visuais para planejar antes de reescrever.",
  },
};

const previewTabs = document.querySelectorAll("[data-preview-tab]");
const previewPanels = document.querySelectorAll("[data-preview-panel]");
const previewTitle = document.querySelector("[data-preview-title]");
const previewCaption = document.querySelector("[data-preview-caption]");

function setPreviewMode(mode) {
  previewTabs.forEach((tab) => {
    const active = tab.dataset.previewTab === mode;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-pressed", String(active));
  });

  previewPanels.forEach((panel) => {
    panel.hidden = panel.dataset.previewPanel !== mode;
  });

  if (previewTitle) previewTitle.textContent = previewCopy[mode].title;
  if (previewCaption) previewCaption.textContent = previewCopy[mode].caption;
}

previewTabs.forEach((tab) => {
  tab.addEventListener("click", () => setPreviewMode(tab.dataset.previewTab));
});
