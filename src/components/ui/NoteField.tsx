import { useEffect, useRef, useState, type Ref } from "react";
import { ptBR } from "../../i18n/pt-BR";
import { MAX_NOTE_CHARS } from "../../lib/types";
import { Button } from "./Button";

interface Props {
  initial?: string;
  /** Receives the trimmed text, or null when blank. */
  onSave: (note: string | null) => void | Promise<void>;
  onCancel: () => void;
  cancelLabel: string;
  autoFocus?: boolean;
  textareaRef?: Ref<HTMLTextAreaElement>;
  className?: string;
  /** E.g. the notch makes its window key before the click focuses the field. */
  onMouseDown?: (e: React.MouseEvent<HTMLTextAreaElement>) => void;
}

/** Note editor: Enter saves (Shift+Enter breaks the line), Esc cancels. Shared by notch and report. */
export function NoteField({ initial = "", onSave, onCancel, cancelLabel, autoFocus, textareaRef, className = "", onMouseDown }: Props) {
  const [text, setText] = useState(initial);
  const own = useRef<HTMLTextAreaElement | null>(null);
  const setRef = (el: HTMLTextAreaElement | null) => {
    own.current = el;
    if (typeof textareaRef === "function") textareaRef(el);
    else if (textareaRef) (textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
  };

  useEffect(() => {
    if (!autoFocus || !own.current) return;
    const el = own.current;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [autoFocus]);

  const save = () => void onSave(text.trim() ? text.trim() : null);

  return (
    <div className={className}>
      <textarea
        ref={setRef}
        aria-label={ptBR.ui.note}
        rows={2}
        maxLength={MAX_NOTE_CHARS}
        value={text}
        placeholder={ptBR.ui.notePlaceholder}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onMouseDown={onMouseDown}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            save();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }
        }}
        className="block w-full resize-none rounded-[10px] bg-raise px-3 py-2 text-[13px] leading-[1.45] text-text outline-none [scrollbar-width:none] placeholder:text-dim focus:ring-2 focus:ring-inset focus:ring-accent2"
      />
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>{cancelLabel}</Button>
        <Button variant="primary" size="sm" onClick={save}>{ptBR.ui.save}</Button>
      </div>
    </div>
  );
}
