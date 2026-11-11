import { useEffect, useRef } from "react";
import { ptBR } from "../../i18n/pt-BR";
import { dur, hm } from "../../lib/format";
import { useNotePrompt } from "../../stores/notePrompt";
import { useTracker } from "../../stores/tracker";
import { NoteField } from "../ui/NoteField";
import { saveNote } from "./actions";
import { Dot } from "./icons";
import { focusWithKeyboard } from "./keyboard";

const s = ptBR.notch;

/** Replaces the panel after a pause/stop from the notch: "what did you do in that block?". */
export function NotePrompt({ onDone }: { onDone: () => void }) {
  const c = useNotePrompt((st) => st.closed);
  const project = useTracker((st) => st.snapshot?.projects.find((p) => p.id === c?.projectId));
  const field = useRef<HTMLTextAreaElement>(null);
  const id = c?.id;

  // A user action (pause/stop click), so the overlay may take the keyboard.
  useEffect(() => {
    if (id !== undefined) void focusWithKeyboard(field.current);
  }, [id]);

  if (!c) return null;
  const finish = () => {
    useNotePrompt.getState().clear();
    onDone();
  };

  return (
    <div data-note-prompt>
      <div className="text-[19px] font-semibold">{s.noteTitle}</div>
      <div className="mb-3 mt-0.5 flex items-center gap-2 text-[13px] text-mute">
        {project && <Dot color={project.color} />}
        <span className="truncate">{s.noteSubtitle(project?.name ?? "", hm(c.start), hm(c.end), dur(c.end - c.start))}</span>
      </div>
      <NoteField
        key={c.id}
        textareaRef={field}
        cancelLabel={s.noteSkip}
        onCancel={finish}
        onMouseDown={(e) => {
          // The overlay is not key: clicking alone would leave typing in the frontmost app.
          if (!document.hasFocus()) {
            e.preventDefault();
            void focusWithKeyboard(e.currentTarget);
          }
        }}
        onSave={async (note) => {
          // Keep the prompt (and the text) when saving fails; the error is toasted.
          if (note && !(await saveNote(c.id, note))) return;
          finish();
        }}
      />
    </div>
  );
}
