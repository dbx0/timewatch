import { AnimatePresence, motion } from "framer-motion";
import { useToasts } from "../../stores/toast";
import { ptBR } from "../../i18n/pt-BR";

export function ToastHost() {
  const current = useToasts((s) => s.current);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed bottom-[22px] left-0 right-0 z-[300] flex justify-center">
      <AnimatePresence>
        {current && (
          <motion.div
            key={current.id}
            role="status"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.25 }}
            className="pointer-events-auto flex items-center gap-3.5 rounded-xl bg-black/85 py-2.5 pl-4 pr-3 text-white backdrop-blur-[10px]"
          >
            <span>{current.message}</span>
            {current.undo && (
              <button
                type="button"
                onClick={() => {
                  current.undo?.();
                  dismiss();
                }}
                className="cursor-pointer rounded-md px-1 font-semibold text-accent outline-none focus-visible:ring-2 focus-visible:ring-accent2"
              >
                {ptBR.ui.undo}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
