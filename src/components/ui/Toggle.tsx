interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}

export function Toggle({ checked, onChange, label }: Props) {
  return (
    <div
      role="switch"
      aria-checked={checked}
      aria-label={label}
      tabIndex={0}
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onChange(!checked);
        }
      }}
      className={`relative inline-block h-6 w-10 flex-none cursor-pointer rounded-full outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-accent2 ${
        checked ? "bg-accent" : "bg-raise2"
      }`}
    >
      <i
        className={`absolute left-[3px] top-[3px] h-[18px] w-[18px] rounded-full transition-transform duration-200 [transition-timing-function:cubic-bezier(.3,1.4,.5,1)] ${
          checked ? "translate-x-4 bg-white" : "bg-[#cfcfd8]"
        }`}
      />
    </div>
  );
}
