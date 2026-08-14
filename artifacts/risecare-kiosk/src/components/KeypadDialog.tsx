import { useState } from "react";
import { X, Delete, Check } from "lucide-react";
import { useRateLimit } from "@/hooks/use-rate-limit";

interface KeypadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (value: string, secondaryValue?: string) => void;
  title: string;
  unit: string;
  isDouble?: boolean; // For Blood Pressure (Sys / Dia)
  secondaryUnit?: string;
}

export function KeypadDialog({ isOpen, onClose, onSave, title, unit, isDouble, secondaryUnit }: KeypadDialogProps) {
  const { isRateLimited } = useRateLimit(300);
  const [value1, setValue1] = useState("");
  const [value2, setValue2] = useState("");
  const [activeInput, setActiveInput] = useState<1 | 2>(1);

  const handleKey = (key: string) => {
    if (isRateLimited("key-" + key)) return;
    if (activeInput === 1) {
      if (value1.length < 5) setValue1(prev => prev + key);
    } else {
      if (value2.length < 5) setValue2(prev => prev + key);
    }
  };

  const handleDelete = () => {
    if (isRateLimited("delete")) return;
    if (activeInput === 1) {
      setValue1(prev => prev.slice(0, -1));
    } else {
      setValue2(prev => prev.slice(0, -1));
    }
  };

  const handleClear = () => {
    if (isRateLimited("clear")) return;
    if (activeInput === 1) setValue1("");
    else setValue2("");
  };

  const handleSave = () => {
    if (isRateLimited("save")) return;
    onSave(value1, value2);
    // Reset state after slight delay for animation
    setTimeout(() => {
      setValue1("");
      setValue2("");
      setActiveInput(1);
    }, 300);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm">
          <div className="bg-card w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-border/50 max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-border flex justify-between items-center bg-secondary/30 shrink-0">
              <h3 className="text-3xl font-bold">{title}</h3>
              <button onClick={onClose} className="p-3 bg-muted rounded-full">
                <X className="w-8 h-8 text-muted-foreground" />
              </button>
            </div>

            <div className="p-6 sm:p-8 sm:pb-4 shrink-0">
              {/* Displays */}
              <div className="flex gap-4 mb-6">
                <div
                  onClick={() => setActiveInput(1)}
                  className={`flex-1 flex flex-col items-center justify-center p-5 rounded-2xl border-4 ${
                    activeInput === 1 ? 'border-primary bg-primary/5' : 'border-muted bg-muted/20'
                  }`}
                >
                  <div className="text-6xl font-bold font-display tracking-tight text-foreground h-16">
                    {value1 || <span className="text-muted-foreground/30">0</span>}
                  </div>
                  <div className="text-xl font-medium text-muted-foreground mt-2">{isDouble ? "Systolic" : unit}</div>
                </div>

                {isDouble && (
                  <>
                    <div className="flex items-center text-5xl font-light text-muted-foreground">/</div>
                    <div
                      onClick={() => setActiveInput(2)}
                      className={`flex-1 flex flex-col items-center justify-center p-5 rounded-2xl border-4 ${
                        activeInput === 2 ? 'border-primary bg-primary/5' : 'border-muted bg-muted/20'
                      }`}
                    >
                      <div className="text-6xl font-bold font-display tracking-tight text-foreground h-16">
                        {value2 || <span className="text-muted-foreground/30">0</span>}
                      </div>
                      <div className="text-xl font-medium text-muted-foreground mt-2">Diastolic</div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Keypad */}
            <div className="h-[40vh] px-5 pb-5 flex flex-col gap-2 shrink-0">
              <div className="flex-1 grid grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                  <button
                    key={num}
                    onClick={() => handleKey(num.toString())}
                    className="h-full text-4xl font-semibold bg-secondary text-secondary-foreground rounded-2xl active:opacity-70"
                  >
                    {num}
                  </button>
                ))}
                <button
                  onClick={() => handleKey(".")}
                  className="h-full text-5xl font-semibold bg-secondary text-secondary-foreground rounded-2xl active:opacity-70"
                >
                  .
                </button>
                <button
                  onClick={() => handleKey("0")}
                  className="h-full text-4xl font-semibold bg-secondary text-secondary-foreground rounded-2xl active:opacity-70"
                >
                  0
                </button>
                <button
                  onClick={handleDelete}
                  className="h-full flex items-center justify-center bg-muted text-muted-foreground rounded-2xl active:opacity-70"
                >
                  <Delete className="w-10 h-10" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 h-[38%]">
                <button
                  onClick={handleClear}
                  className="h-full text-2xl font-bold bg-muted text-muted-foreground rounded-2xl active:opacity-70"
                >
                  Clear
                </button>
                <button
                  onClick={handleSave}
                  disabled={!value1 && !value2}
                  className="h-full text-2xl font-bold bg-primary text-primary-foreground rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-primary/25 active:opacity-70"
                >
                  <Check className="w-9 h-9" />
                  Save
                </button>
              </div>
            </div>
          </div>
    </div>
  );
}
