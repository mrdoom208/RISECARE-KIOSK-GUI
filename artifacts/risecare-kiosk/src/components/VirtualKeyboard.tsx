import { useState, useEffect, useCallback, useRef } from "react";

const INPUT_TAGS = new Set(["input", "textarea"]);

function isInputElement(el: unknown): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  return INPUT_TAGS.has(el.tagName.toLowerCase());
}

function shouldShowKeyboard(el: HTMLElement): boolean {
  if (!isInputElement(el)) return false;
  const type = (el as HTMLInputElement).type || "text";
  if (["hidden", "checkbox", "radio", "submit", "button", "file", "image"].includes(type)) return false;
  if (el.isContentEditable) return true;
  return !el.readOnly && !el.disabled;
}

function isNumeric(el: HTMLElement): boolean {
  if (!isInputElement(el)) return false;
  const input = el as HTMLInputElement;
  const type = input.type;
  const mode = input.inputMode || "";
  return type === "number" || type === "tel" || mode === "numeric" || mode === "decimal";
}

type Layout = "qwerty" | "numeric";

const QWERTY_ROWS = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["Shift", "z", "x", "c", "v", "b", "n", "m", "Backspace"],
  ["?123", "Space", "Done"],
];

const NUMERIC_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["Clear", "0", "Backspace"],
];

function insertTextAtCursor(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  const before = el.value.slice(0, start);
  const after = el.value.slice(end);
  const newValue = before + text + after;

  const proto = Object.getOwnPropertyDescriptor(
    (el instanceof HTMLInputElement ? HTMLInputElement : HTMLTextAreaElement).prototype,
    "value",
  );
  proto?.set?.call(el, newValue);
  el.setSelectionRange(start + text.length, start + text.length);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function backspaceAtCursor(el: HTMLInputElement | HTMLTextAreaElement) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  if (start === 0 && end === 0) return;

  const before = el.value.slice(0, start);
  const after = el.value.slice(end);
  const newValue = before.slice(0, -1) + after;
  const newCursor = Math.max(0, start - 1);

  const proto = Object.getOwnPropertyDescriptor(
    (el instanceof HTMLInputElement ? HTMLInputElement : HTMLTextAreaElement).prototype,
    "value",
  );
  proto?.set?.call(el, newValue);
  el.setSelectionRange(newCursor, newCursor);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function clearValue(el: HTMLInputElement | HTMLTextAreaElement) {
  const proto = Object.getOwnPropertyDescriptor(
    (el instanceof HTMLInputElement ? HTMLInputElement : HTMLTextAreaElement).prototype,
    "value",
  );
  proto?.set?.call(el, "");
  el.setSelectionRange(0, 0);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export function VirtualKeyboard() {
  const [visible, setVisible] = useState(false);
  const [shift, setShift] = useState(false);
  const [layout, setLayout] = useState<Layout>("qwerty");
  const elRef = useRef<HTMLElement | null>(null);
  const isPressingKey = useRef(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (!shouldShowKeyboard(target)) return;
      if (blurTimer.current) clearTimeout(blurTimer.current);
      elRef.current = target;
      setVisible(true);
      setLayout(isNumeric(target) ? "numeric" : "qwerty");
      setShift(false);
    };

    const onFocusOut = () => {
      blurTimer.current = setTimeout(() => {
        if (isPressingKey.current) return;
        if (
          document.activeElement !== elRef.current ||
          !shouldShowKeyboard(document.activeElement as HTMLElement)
        ) {
          elRef.current = null;
          setVisible(false);
        }
      }, 150);
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      if (blurTimer.current) clearTimeout(blurTimer.current);
    };
  }, []);

  const handleChar = useCallback((char: string) => {
    const el = elRef.current;
    if (!isInputElement(el)) return;
    insertTextAtCursor(el, char);
    setShift(false);
  }, []);

  const handleBackspace = useCallback(() => {
    const el = elRef.current;
    if (!isInputElement(el)) return;
    backspaceAtCursor(el);
  }, []);

  const handleSpace = useCallback(() => handleChar(" "), [handleChar]);

  const handleDone = useCallback(() => {
    elRef.current?.blur();
  }, []);

  const handleClear = useCallback(() => {
    const el = elRef.current;
    if (!isInputElement(el)) return;
    clearValue(el);
  }, []);

  const handleKey = (key: string) => {
    switch (key) {
      case "Shift":
        setShift((s) => !s);
        break;
      case "Backspace":
        handleBackspace();
        break;
      case "Space":
        handleSpace();
        break;
      case "Done":
        handleDone();
        break;
      case "Clear":
        handleClear();
        break;
      case "?123":
        setLayout("numeric");
        break;
      case "ABC":
        setLayout("qwerty");
        break;
      default:
        handleChar(shift ? key.toUpperCase() : key);
        break;
    }
  };

  if (!visible) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isPressingKey.current = true;
  };

  const handleMouseUp = () => {
    isPressingKey.current = false;
  };

  const btn = (label: string, opts: { wide?: boolean; primary?: boolean; danger?: boolean } = {}) => {
    const isSpecial = ["Shift", "Backspace", "Space", "Done", "Clear", "?123", "ABC"].includes(label);
    return (
      <button
        key={label}
        onMouseDown={(e) => { handleMouseDown(e); handleKey(label); }}
        onMouseUp={handleMouseUp}
        className={`h-12 md:h-14 rounded-lg text-base md:text-lg font-semibold flex items-center justify-center ${
          opts.primary
            ? "bg-primary text-primary-foreground"
            : opts.danger
              ? "bg-destructive/10 text-destructive"
              : isSpecial
                ? "bg-muted text-muted-foreground px-3"
                : "bg-secondary text-secondary-foreground"
        } ${opts.wide ? "flex-[2]" : "flex-1"} active:opacity-70`}
      >
        {label === "Backspace" ? "⌫" : label === "Space" ? "Space" : label === "Shift" ? (shift ? "⇧" : "⇪") : label}
      </button>
    );
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      className="fixed bottom-0 left-0 right-0 z-[9999] bg-card border-t border-border p-2 pb-6 shadow-2xl">
      {layout === "qwerty" ? (
        <div className="max-w-3xl mx-auto space-y-1.5">
          {QWERTY_ROWS.map((row, ri) => (
            <div key={ri} className="flex gap-1 justify-center">
              {row[0] === "Shift" ? (
                <>
                  {btn("Shift")}
                  {row.slice(1, -1).map((k) => btn(k))}
                  {btn("Backspace")}
                </>
              ) : row[0] === "?123" ? (
                <>
                  {btn("?123")}
                  {btn("Space", { wide: true })}
                  {btn("Done", { primary: true })}
                </>
              ) : (
                row.map((k) => btn(k))
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="max-w-sm mx-auto space-y-1.5">
          {NUMERIC_ROWS.map((row, ri) => (
            <div key={ri} className="flex gap-2 justify-center">
              {row.map((k) => {
                if (k === "Clear") return btn("Clear", { danger: true });
                if (k === "Backspace") return btn("Backspace");
                return btn(k);
              })}
            </div>
          ))}
          <div className="flex gap-2">
            {btn("ABC")}
            {btn("Done", { primary: true, wide: true })}
          </div>
        </div>
      )}
    </div>
  );
}
