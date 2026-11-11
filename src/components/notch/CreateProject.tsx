import { useEffect, useRef, useState } from "react";
import { useT } from "../../i18n";
import { toast } from "../../stores/toast";
import { useTracker } from "../../stores/tracker";
import { Button } from "../ui/Button";
import { ColorPicker, PROJECT_PALETTE } from "../ui/ColorPicker";
import { createAndStart } from "./actions";
import { focusWithKeyboard } from "./keyboard";

const input =
  "w-full rounded-[10px] border border-transparent bg-raise px-3 py-2.5 text-text outline-none transition placeholder:text-dim focus:border-accent focus:bg-raise2";
const group = "mb-1.5 ml-0.5 mt-3.5 text-[11px] uppercase tracking-[.06em] text-dim";

/** Inputs in the overlay need the window to be key before they can take typing. */
const keyOnMouseDown = (e: React.MouseEvent<HTMLInputElement>) => {
  if (document.activeElement !== e.currentTarget) {
    e.preventDefault();
    void focusWithKeyboard(e.currentTarget);
  }
};

export function CreateProject({ initialName, onBack, onDone }: {
  initialName: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const s = useT().notch;
  const projects = useTracker((st) => st.snapshot?.projects ?? []);
  const clients = [...new Set(projects.map((p) => p.client))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const [name, setName] = useState(initialName);
  const [client, setClient] = useState<string | null>(null);
  const [newClient, setNewClient] = useState("");
  const [color, setColor] = useState(() => PROJECT_PALETTE[projects.length % PROJECT_PALETTE.length]);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.hasFocus()) nameRef.current?.focus();
  }, []);

  const submit = async () => {
    const n = name.trim();
    if (!n) {
      void focusWithKeyboard(nameRef.current);
      toast(s.nameRequired);
      return;
    }
    if (busy) return;
    setBusy(true);
    const ok = await createAndStart(n, newClient.trim() || client || s.noClient, color);
    setBusy(false);
    if (ok) onDone();
  };
  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={onBack}
          className="cursor-pointer rounded-md text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent2">
          {s.back}
        </button>
        <b>{s.newProject}</b>
        <span className="w-[50px]" />
      </div>
      <input ref={nameRef} className={input} placeholder={s.projectName} value={name} autoComplete="off" spellCheck={false}
        onChange={(e) => setName(e.target.value)} onMouseDown={keyOnMouseDown} onKeyDown={onEnter} />
      <div className={group}>{s.client}</div>
      {clients.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {clients.map((c) => {
            const on = client === c && !newClient.trim();
            return (
              <button key={c} type="button" aria-pressed={on}
                onClick={() => { setClient(c); setNewClient(""); }}
                className={`cursor-pointer rounded-full px-2.5 py-[3px] text-xs outline-none focus-visible:ring-2 focus-visible:ring-accent2 ${
                  on ? "bg-accent text-white" : "bg-raise2 text-text hover:bg-[#2e2e38]"
                }`}>
                {c}
              </button>
            );
          })}
        </div>
      )}
      <input className={input} placeholder={clients.length ? s.newClient : s.clientName} value={newClient}
        autoComplete="off" spellCheck={false}
        onChange={(e) => setNewClient(e.target.value)} onMouseDown={keyOnMouseDown} onKeyDown={onEnter} />
      <div className={group}>{s.color}</div>
      <div className="-m-2">
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onBack}>{s.cancel}</Button>
        <Button variant="primary" disabled={busy} onClick={() => void submit()}>{s.createAndStart}</Button>
      </div>
    </>
  );
}
