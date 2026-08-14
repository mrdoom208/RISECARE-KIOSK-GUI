import { useState, useEffect, useCallback, useRef } from "react";
import { useVirtualKeyboard } from "@/hooks/use-virtual-keyboard";

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
  const { setVisible } = useVirtualKeyboard();
  const [visible, setVisibleInternal] = useState(false);
  const [shift, setShift] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [layout, setLayout] = useState<Layout>("qwerty");
  const elRef = useRef<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isPressingKey = useRef(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backspaceInitialTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backspaceRepeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopBackspaceRepeat = useCallback(() => {
    if (backspaceInitialTimer.current) {
      clearTimeout(backspaceInitialTimer.current);
      backspaceInitialTimer.current = null;
    }
    if (backspaceRepeatTimer.current) {
      clearInterval(backspaceRepeatTimer.current);
      backspaceRepeatTimer.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopBackspaceRepeat();
    };
  }, [stopBackspaceRepeat]);

  useEffect(() => {
    const update = () => {
      const el = containerRef.current;
      document.documentElement.style.setProperty("--vk-height", el ? `${el.offsetHeight}px` : "0px");
    };
    update();
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      document.documentElement.style.setProperty("--vk-height", "0px");
    };
  }, [visible, layout]);

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (!shouldShowKeyboard(target)) return;
      if (blurTimer.current) clearTimeout(blurTimer.current);
      elRef.current = target;
      setVisibleInternal(true);
      setVisible(true);
      setLayout(isNumeric(target) ? "numeric" : "qwerty");
      setShift(false);
      window.setTimeout(() => {
        target.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 50);
    };

    const onFocusOut = () => {
      blurTimer.current = setTimeout(() => {
        if (isPressingKey.current) return;
        const active = document.activeElement;
        if (containerRef.current?.contains(active) && active !== elRef.current) {
          elRef.current?.focus({ preventScroll: true });
          return;
        }
        if (
          document.activeElement !== elRef.current ||
          !shouldShowKeyboard(document.activeElement as HTMLElement)
        ) {
          elRef.current = null;
          setVisibleInternal(false);
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

  useEffect(() => {
    const updateCapsLock = (e: KeyboardEvent) => {
      if (typeof e.getModifierState === "function") {
        setCapsLock(e.getModifierState("CapsLock"));
      }
    };
    window.addEventListener("keydown", updateCapsLock);
    window.addEventListener("keyup", updateCapsLock);
    return () => {
      window.removeEventListener("keydown", updateCapsLock);
      window.removeEventListener("keyup", updateCapsLock);
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

  const startBackspaceRepeat = useCallback(() => {
    stopBackspaceRepeat();
    backspaceInitialTimer.current = setTimeout(() => {
      handleBackspace();
      backspaceRepeatTimer.current = setInterval(() => {
        handleBackspace();
      }, 50);
    }, 300);
  }, [handleBackspace, stopBackspaceRepeat]);

  const handleSpace = useCallback(() => handleChar(" "), [handleChar]);

  const handleDone = useCallback(() => {
    const el = elRef.current;
    if (el && isInputElement(el)) {
      el.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        })
      );
    }
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
        handleChar(capsLock !== shift ? key.toUpperCase() : key);
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
    stopBackspaceRepeat();
  };

  const handlePointerUp = () => {
    isPressingKey.current = false;
    stopBackspaceRepeat();
  };

  const handleButtonPointerDown = (label: string, e: React.PointerEvent) => {
    e.preventDefault();
    isPressingKey.current = true;
    if (label === "Backspace") {
      handleBackspace();
      startBackspaceRepeat();
    } else {
      handleKey(label);
    }
    if (label !== "Done" && elRef.current) elRef.current.focus({ preventScroll: true });
  };

  const btn = (label: string, opts: { wide?: boolean; primary?: boolean; danger?: boolean } = {}) => {
    const isSpecial = ["Shift", "Backspace", "Space", "Done", "Clear", "?123", "ABC"].includes(label);
    return (
      <button
        key={label}
        onPointerDown={(e) => handleButtonPointerDown(label, e)}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        className={`h-12 portrait:h-20 md:h-14 rounded-lg text-base portrait:text-lg md:text-lg font-semibold flex items-center justify-center ${
          opts.primary
            ? "bg-primary text-primary-foreground"
            : opts.danger
              ? "bg-destructive/10 text-destructive"
              : isSpecial
                ? "bg-muted text-muted-foreground px-3"
                : "bg-secondary text-secondary-foreground"
        } ${opts.wide ? "flex-[2]" : "flex-1"} active:brightness-75`}
      >
        {label === "Backspace"
          ? "⌫"
          : label === "Space"
            ? "Space"
            : label === "Shift"
              ? shift || capsLock
                ? "⇧"
                : "⇪"
              : /^[a-z]$/.test(label)
                ? capsLock !== shift
                  ? label.toUpperCase()
                  : label
                : label}
      </button>
    );
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={(e) => {
        isPressingKey.current = true;
        e.preventDefault();
        e.stopPropagation();
      }}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        isPressingKey.current = true;
      }}
      onMouseUp={handleMouseUp}
      data-virtual-keyboard
      className="pointer-events-auto fixed bottom-0 left-0 right-0 z-[9999] bg-card border-t border-border p-2 portrait:p-3.5 portrait:pb-8 shadow-2xl">
      {layout === "qwerty" ? (
        <div className="max-w-3xl mx-auto space-y-1.5 portrait:space-y-2.5">
          {QWERTY_ROWS.map((row, ri) => (
            <div key={ri} className="flex gap-1 portrait:gap-2 justify-center">
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
        <div className="max-w-sm mx-auto space-y-1.5 portrait:space-y-2.5">
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
