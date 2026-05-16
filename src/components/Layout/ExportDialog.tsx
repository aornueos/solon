import { useState } from "react";
import { FileDown, X } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import {
  exportFileToPdf,
  exportFolderToPdf,
  type PrintFont,
  type PrintSize,
} from "../../lib/pdfExport";
import {
  exportFileToDocx,
  exportFolderToDocx,
  type DocxOptions,
} from "../../lib/docxExport";

type ExportFormat = "pdf" | "docx";

export function ExportDialog() {
  const open = useAppStore((s) => s.showExport);
  const close = useAppStore((s) => s.closeExport);
  const activeFilePath = useAppStore((s) => s.activeFilePath);
  const activeFileName = useAppStore((s) => s.activeFileName);
  const fileTree = useAppStore((s) => s.fileTree);
  const rootFolder = useAppStore((s) => s.rootFolder);
  const pushToast = useAppStore((s) => s.pushToast);

  const [scope, setScope] = useState<"file" | "project">("file");
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [size, setSize] = useState<PrintSize>("book");
  const [font, setFont] = useState<PrintFont>("serif");
  const [toc, setToc] = useState(true);
  const [busy, setBusy] = useState(false);

  // Folha de rosto Shunn — contato preenchido aqui (não persiste).
  const [authorName, setAuthorName] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [penName, setPenName] = useState("");
  const [docTitle, setDocTitle] = useState("");

  if (!open) return null;

  const canExportFile = !!activeFilePath;
  const canExportProject = fileTree.length > 0;
  const projectName =
    rootFolder?.split(/[\\/]/).filter(Boolean).pop() ?? "Projeto";
  const defaultTitle =
    scope === "file"
      ? activeFileName?.replace(/\.(md|txt)$/i, "") ?? ""
      : projectName;

  const handleExport = async () => {
    const filePath = activeFilePath;
    const fileName = activeFileName;
    if (scope === "file" && (!filePath || !fileName)) {
      pushToast("error", "Abra um arquivo antes de exportar.");
      return;
    }
    if (scope === "project" && !canExportProject) {
      pushToast("error", "Abra uma pasta antes de exportar.");
      return;
    }
    setBusy(true);
    try {
      let savedPath: string | null;
      if (format === "docx") {
        const opts: DocxOptions = {
          authorName: authorName.trim(),
          address: address.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          penName: penName.trim() || undefined,
          title: docTitle.trim() || undefined,
          category: scope === "file" ? "short" : "novel",
        };
        savedPath =
          scope === "file"
            ? await exportFileToDocx(filePath!, fileName!, opts)
            : await exportFolderToDocx(fileTree, projectName, opts);
      } else if (scope === "file") {
        savedPath = await exportFileToPdf(filePath!, fileName!, {
          size,
          font,
          toc: false,
        });
      } else {
        savedPath = await exportFolderToPdf(fileTree, projectName, {
          size,
          font,
          toc,
        });
      }
      if (savedPath) {
        pushToast("success", format === "docx" ? "DOCX exportado." : "PDF exportado.");
        close();
      }
    } catch (err) {
      console.error("Erro ao exportar:", err);
      pushToast(
        "error",
        `Falha ao exportar: ${err instanceof Error ? err.message : "erro desconhecido"}`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[125] flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Exportar"
        className="w-full max-w-md rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-3.5 shrink-0"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div className="inline-flex items-center gap-2">
            <FileDown size={15} />
            <h2 className="text-[1rem] font-medium">
              {format === "docx" ? "Exportar manuscrito (DOCX)" : "Exportar para PDF"}
            </h2>
          </div>
          <button
            onClick={close}
            aria-label="Fechar"
            className="p-1.5 rounded"
            style={{ color: "var(--text-muted)" }}
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <Section title="Formato">
            <div className="flex gap-1.5">
              <SizeBtn
                value="pdf"
                current={format}
                label="PDF"
                hint="Leitura / impressão"
                onSelect={setFormat}
              />
              <SizeBtn
                value="docx"
                current={format}
                label="DOCX"
                hint="Manuscrito Shunn"
                onSelect={setFormat}
              />
            </div>
          </Section>

          <Section title="O que exportar">
            <Choice
              checked={scope === "file"}
              disabled={!canExportFile}
              label={
                canExportFile
                  ? `Arquivo atual - ${activeFileName?.replace(/\.(md|txt)$/i, "")}`
                  : "Arquivo atual (nenhum aberto)"
              }
              onSelect={() => setScope("file")}
            />
            <Choice
              checked={scope === "project"}
              disabled={!canExportProject}
              label={
                canExportProject
                  ? "Projeto inteiro (todos os arquivos da pasta)"
                  : "Projeto inteiro (sem pasta aberta)"
              }
              onSelect={() => setScope("project")}
            />
          </Section>

          {format === "pdf" && (
            <>
              <Section title="Tamanho da pagina">
                <div className="flex gap-1.5">
                  <SizeBtn value="book" current={size} label="Livro" hint="5,5 x 8,5 in" onSelect={setSize} />
                  <SizeBtn value="a5" current={size} label="A5" hint="148 x 210 mm" onSelect={setSize} />
                  <SizeBtn value="a4" current={size} label="A4" hint="210 x 297 mm" onSelect={setSize} />
                </div>
              </Section>

              <Section title="Tipografia">
                <div className="flex gap-1.5">
                  <SizeBtn value="serif" current={font} label="Serifada" hint="Times" onSelect={setFont} />
                  <SizeBtn value="sans" current={font} label="Sem serifa" hint="Helvetica" onSelect={setFont} />
                </div>
              </Section>

              {scope === "project" && (
                <label
                  className="flex items-center gap-2 text-[0.82rem] cursor-pointer"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <input
                    type="checkbox"
                    checked={toc}
                    onChange={(e) => setToc(e.target.checked)}
                  />
                  Incluir sumario antes do conteudo
                </label>
              )}

              <p
                className="text-[0.7rem] italic leading-relaxed pt-1"
                style={{ color: "var(--text-muted)" }}
              >
                O Solon vai gerar um PDF limpo e pedir onde salvar. Ele nao usa
                print preview nem abre pop-up.
              </p>
            </>
          )}

          {format === "docx" && (
            <Section title="Folha de rosto (formato Shunn)">
              <Field
                label="Título da obra"
                value={docTitle}
                placeholder={defaultTitle}
                onChange={setDocTitle}
              />
              <Field
                label="Nome legal"
                value={authorName}
                placeholder="Como assina contratos"
                onChange={setAuthorName}
              />
              <Field
                label="Endereço"
                value={address}
                placeholder="Rua, número, cidade, CEP"
                onChange={setAddress}
                multiline
              />
              <div className="flex gap-1.5">
                <Field label="Email" value={email} placeholder="voce@email.com" onChange={setEmail} />
                <Field label="Telefone" value={phone} placeholder="opcional" onChange={setPhone} />
              </div>
              <Field
                label="Nome artístico (byline)"
                value={penName}
                placeholder={authorName.trim() || "igual ao nome legal"}
                onChange={setPenName}
              />
              <p
                className="text-[0.7rem] italic leading-relaxed pt-1"
                style={{ color: "var(--text-muted)" }}
              >
                {scope === "file"
                  ? "Conto: corpo segue na primeira página, palavras à centena."
                  : "Romance: cada arquivo vira um capítulo em página nova, palavras à milhar."}{" "}
                Times New Roman 12, espaço duplo, margens de 1in, cabeçalho
                corrido com número de página — o que agentes e revistas esperam.
              </p>
            </Section>
          )}
        </div>

        <div
          className="px-5 py-3 flex items-center justify-end gap-2 shrink-0"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          <button
            type="button"
            onClick={close}
            className="text-[0.82rem] px-3 py-1.5 rounded"
            style={{
              background: "var(--bg-panel-2)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={busy || (scope === "file" ? !canExportFile : !canExportProject)}
            className="text-[0.82rem] px-3 py-1.5 rounded inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: "var(--accent)",
              color: "var(--text-inverse)",
              border: "1px solid var(--accent)",
            }}
          >
            <FileDown size={12} />
            {busy ? "Gerando..." : "Exportar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        className="text-[0.65rem] font-semibold uppercase tracking-widest mb-1.5"
        style={{ color: "var(--text-muted)" }}
      >
        {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  placeholder,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  const sharedStyle = {
    background: "var(--bg-panel-2)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
  };
  return (
    <label className="block flex-1">
      <span
        className="block text-[0.7rem] mb-0.5"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
      </span>
      {multiline ? (
        <textarea
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="w-full text-[0.82rem] px-2 py-1.5 rounded resize-none outline-none"
          style={sharedStyle}
        />
      ) : (
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full text-[0.82rem] px-2 py-1.5 rounded outline-none"
          style={sharedStyle}
        />
      )}
    </label>
  );
}

function Choice({
  checked,
  disabled,
  label,
  onSelect,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <label
      className="flex items-center gap-2 cursor-pointer text-[0.82rem]"
      style={{
        color: disabled ? "var(--text-placeholder)" : "var(--text-secondary)",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <input
        type="radio"
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
      />
      <span>{label}</span>
    </label>
  );
}

function SizeBtn<V extends string>({
  value,
  current,
  label,
  hint,
  onSelect,
}: {
  value: V;
  current: V;
  label: string;
  hint: string;
  onSelect: (v: V) => void;
}) {
  const active = value === current;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className="flex-1 px-2.5 py-2 rounded text-left transition-colors"
      style={{
        background: active ? "var(--bg-hover)" : "var(--bg-panel-2)",
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        color: active ? "var(--accent)" : "var(--text-primary)",
      }}
    >
      <div className="text-[0.78rem] font-medium">{label}</div>
      <div
        className="text-[0.65rem]"
        style={{ color: "var(--text-muted)" }}
      >
        {hint}
      </div>
    </button>
  );
}
