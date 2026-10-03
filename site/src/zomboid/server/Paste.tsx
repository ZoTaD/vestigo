/**
 * "Pegá tu archivo" (Task 3, 2026-10-02): una hoja arriba del generador donde se pega (o se elige) el
 * `<nombre>_SandboxVars.lua` o el `<nombre>.ini` de un servidor que ya existe. Muestra a qué preset se parece, qué
 * cambia respecto de él, las claves que no son del juego (que se conservan) y los avisos con su renglón; "Cargar en el
 * generador" pasa todo al estado.
 *
 * El archivo se lee en el navegador (`FileReader`) y se interpreta con los lectores de `lua.ts` e `ini.ts`, que nunca
 * ejecutan nada: no se sube a ningún lado.
 */
import { useDeferredValue, useId, useMemo, useRef, useState } from "react";
import { useLang } from "../../i18n";
import { Stamp } from "../ui";
import { MAX_FILE, nearestPreset, type Issue } from "./config";
import { usePzServerCopy } from "./copy";
import { fullPreset, iniByKey, INI_DEFAULTS, optionByKey, presetById, SERVER, type IniOption, type SandboxOption, type Value } from "./data";
import { parseIni, type IniParse } from "./ini";
import { fileKind, parseSandboxLua, type LuaParse } from "./lua";
import { KeyBreaks, SoftBreaks, useShowValue } from "./OptionRow";

export type PastedFile = { kind: "lua"; parse: LuaParse } | { kind: "ini"; parse: IniParse };
type Choice = "auto" | "lua" | "ini";

/** Cuántos avisos o claves se listan: un archivo roto a propósito puede traer decenas de miles, y la pestaña se congelaría. */
const LIST_MAX = 200;

/** El nombre de cada tipo de archivo, para el selector y el "Automático (…)". */
const KIND_NAME = { lua: "SandboxVars.lua", ini: ".ini" } as const;

/** Una fila de "Qué cambia": la opción, lo que dice el archivo y lo de la base. */
/** `missing`: el archivo no la trae, o (`"ignored"`) la trae con un valor que el juego no acepta. */
type Diff = { key: string; opt: SandboxOption | IniOption; file: Value; base: Value; missing: false | "absent" | "ignored" };

export default function Paste({ onLoad }: { onLoad: (file: PastedFile, fileName: string | null) => boolean }) {
  const t = usePzServerCopy().paste;
  const { lang } = useLang();
  const show = useShowValue();
  const id = useId();
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [choice, setChoice] = useState<Choice>("auto");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const deferred = useDeferredValue(text);

  const detected = useMemo(() => fileKind(deferred), [deferred]);
  const kind = choice === "auto" ? detected : choice;
  const file: PastedFile | null = useMemo(() => {
    if (!deferred.trim()) return null;
    return kind === "lua" ? { kind, parse: parseSandboxLua(deferred) } : { kind, parse: parseIni(deferred) };
  }, [deferred, kind]);

  const baseline = presetById(SERVER.baseline)!.name[lang];
  const summary = useMemo(() => {
    if (!file) return null;
    if (file.kind === "lua") {
      if (!file.parse.ok) return null;
      const near = nearestPreset(file.parse.values);
      const preset = fullPreset(near.id);
      const values = file.parse.values;
      const full = { ...fullPreset(SERVER.baseline), ...values };
      const rejected = new Set(file.parse.issues.map((i) => i.key));
      const diffs: Diff[] = SERVER.options
        .filter((o) => full[o.key] !== preset[o.key])
        .map((o) => {
          const missing = Object.hasOwn(values, o.key) ? false : rejected.has(o.key) ? "ignored" : "absent";
          return { key: o.key, opt: o, file: full[o.key], base: preset[o.key], missing };
        });
      return { title: t.like(presetById(near.id)!.name[lang], near.diff), baseCol: t.colPreset(presetById(near.id)!.name[lang]), diffs };
    }
    const values = file.parse.values;
    const diffs: Diff[] = SERVER.ini
      .filter((o) => Object.hasOwn(values, o.key) && values[o.key] !== INI_DEFAULTS[o.key])
      .map((o) => ({ key: o.key, opt: o, file: values[o.key], base: INI_DEFAULTS[o.key], missing: false }));
    return { title: t.iniLike(diffs.length), baseCol: t.colDefault, diffs };
  }, [file, t, lang]);

  const unknown = file ? file.parse.issues.filter((i) => i.kind === "unknown") : [];
  const warnings = file ? file.parse.issues.filter((i) => i.kind !== "unknown") : [];
  const canLoad = !!file && (file.kind === "lua" ? file.parse.ok : Object.keys(file.parse.values).length > 0 || file.parse.extra.length > 0);

  /** Lo que el juego usa en lugar de un valor que no acepta, con la etiqueta del enum. */
  const usedText = (i: Issue): string | undefined => {
    if (i.used === undefined || !i.key) return undefined;
    const opt = file?.kind === "ini" ? iniByKey(i.key) : optionByKey(i.key);
    return opt && i.kind !== "equals" ? show(opt, i.used) : String(i.used);
  };

  const pick = (f: File | undefined) => {
    setError(null);
    setLoaded(false);
    if (!f) return;
    if (f.size > MAX_FILE) {
      setError(t.tooBig);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setText(typeof reader.result === "string" ? reader.result : "");
      setFileName(f.name);
    };
    reader.onerror = () => setError(t.readError);
    reader.readAsText(f);
  };

  const load = () => {
    if (!file || !canLoad) return;
    if (onLoad(file, fileName)) setLoaded(true);
  };

  return (
    <details className="pz-page pzsv-sheet pzsv-paste">
      <summary>
        <h2 className="pzi-h2">
          <Stamp name="book" />
          {t.title}
          <span className="pzi-hand">{t.hand}</span>
        </h2>
      </summary>
      <p className="pzsv-about">{t.intro}</p>
      <p className="pzsv-privacy">{t.privacy}</p>

      <div className="pzsv-paste-in">
        <label className="pzsv-paste-label" htmlFor={`${id}-text`}>
          {t.label}
          {fileName && <code>{fileName}</code>}
        </label>
        <textarea
          id={`${id}-text`}
          className="pzsv-paste-text"
          value={text}
          placeholder={t.placeholder}
          spellCheck={false}
          autoComplete="off"
          rows={8}
          onChange={(e) => {
            setText(e.target.value);
            // Lo que se escribe a mano ya no es el archivo elegido: su nombre no renombra el servidor.
            setFileName(null);
            setLoaded(false);
            setError(null);
          }}
        />
        <div className="pzsv-paste-tools">
          <button type="button" className="pzi-copy" onClick={() => fileInput.current?.click()}>
            {t.choose}
          </button>
          <input
            ref={fileInput}
            className="visually-hidden"
            type="file"
            accept=".lua,.ini,.txt"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <div className="pzsv-paste-kind" role="group" aria-label={t.kindLabel}>
            <span>{t.kindLabel}</span>
            {(["auto", "lua", "ini"] as const).map((c) => (
              <button type="button" className="pzi-chip" aria-pressed={choice === c} onClick={() => setChoice(c)} key={c}>
                {c === "auto" ? t.kindAuto(KIND_NAME[detected]) : KIND_NAME[c]}
              </button>
            ))}
          </div>
        </div>
        {error && (
          <p className="pzsv-paste-error" role="alert">
            {error}
          </p>
        )}
      </div>

      {file && (
        <div className="pzsv-paste-out" aria-live="polite">
          {file.kind === "lua" && !file.parse.ok && !warnings.some((i) => i.kind === "size") && <p className="pzsv-paste-error">{t.noTable}</p>}
          {summary && (
            <>
              <h3 className="pzsv-h3">{summary.title}</h3>
              {summary.diffs.length > 0 && (
                <details className="pzsv-paste-block" open={summary.diffs.length <= 20}>
                  <summary>
                    {t.diffTitle} <small>{summary.diffs.length}</small>
                  </summary>
                  <div className="pzsv-diffs" role="table">
                    <div className="pzsv-diff is-head" role="row">
                      <span role="columnheader">{t.colOption}</span>
                      <span role="columnheader">{t.colFile}</span>
                      <span role="columnheader">{summary.baseCol}</span>
                    </div>
                    {summary.diffs.map((d) => (
                      <div className="pzsv-diff" role="row" key={d.key}>
                        <span role="cell" className="pzsv-diff-name">
                          {"name" in d.opt && <b>{d.opt.name[lang]}</b>}
                          <code>
                            <KeyBreaks k={d.key} />
                          </code>
                        </span>
                        <span role="cell" className="pzsv-diff-file">
                          <i className="pzsv-diff-col">{t.colFile}</i>
                          <SoftBreaks text={show(d.opt, d.file)} />
                          {d.missing && <small>{d.missing === "ignored" ? t.ignored(baseline) : t.notInFile(baseline)}</small>}
                        </span>
                        <span role="cell" className="pzsv-diff-base">
                          <i className="pzsv-diff-col">{summary.baseCol}</i>
                          <SoftBreaks text={show(d.opt, d.base)} />
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </>
          )}

          {unknown.length > 0 && (
            <div className="pzsv-paste-block">
              <h4>{t.extraTitle}</h4>
              <p className="pzsv-about">{t.extraNote}</p>
              <ul className="pzsv-paste-list">
                {unknown.slice(0, LIST_MAX).map((i) => (
                  <li key={`${i.line}-${i.key}`}>
                    <span className="pzsv-line">{t.line(i.line)}</span>
                    <code>
                      <KeyBreaks k={i.key ?? ""} />
                    </code>
                  </li>
                ))}
              </ul>
              {unknown.length > LIST_MAX && <p className="pzsv-about">{t.more(unknown.length - LIST_MAX)}</p>}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="pzsv-paste-block">
              <h4>{t.issuesTitle}</h4>
              <ul className="pzsv-paste-list">
                {warnings.slice(0, LIST_MAX).map((i, n) => (
                  <li key={n}>
                    <span className="pzsv-line">{t.line(i.line)}</span>
                    <span>
                      <SoftBreaks text={t.issue({ kind: i.kind, file: file.kind, fatal: i.fatal, deep: i.deep, key: i.key, got: i.got, used: usedText(i) })} />
                    </span>
                  </li>
                ))}
              </ul>
              {warnings.length > LIST_MAX && <p className="pzsv-about">{t.more(warnings.length - LIST_MAX)}</p>}
            </div>
          )}

          <p className="pzsv-paste-actions">
            <button type="button" className="pzi-copy pzsv-paste-load" disabled={!canLoad} onClick={load}>
              {t.load}
            </button>
            {loaded && <span role="status">{t.loaded}</span>}
          </p>
        </div>
      )}
    </details>
  );
}
