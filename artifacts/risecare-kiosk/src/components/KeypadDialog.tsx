import { useState } from "react";
import { X, Delete, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
  const [value1, setValue1] = useState("");
  const [value2, setValue2] = useState("");
  const [activeInput, setActiveInput] = useState<1 | 2>(1);

  const handleKey = (key: string) => {
    if (activeInput === 1) {
      if (value1.length < 5) setValue1(prev => prev + key);
    } else {
      if (value2.length < 5) setValue2(prev => prev + key);
    }
  };

  const handleDelete = () => {
    if (activeInput === 1) {
      setValue1(prev => prev.slice(0, -1));
    } else {
      setValue2(prev => prev.slice(0, -1));
    }
  };

  const handleClear = () => {
    if (activeInput === 1) setValue1("");
    else setValue2("");
  };

  const handleSave = () => {
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
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-card w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-border/50"
          >
            <div className="p-6 border-b border-border flex justify-between items-center bg-secondary/30">
              <h3 className="text-2xl font-bold">{title}</h3>
              <button onClick={onClose} className="p-3 bg-muted rounded-full active:bg-border transition-colors">
                <X className="w-8 h-8 text-muted-foreground" />
              </button>
            </div>

            <div className="p-8">
              {/* Displays */}
              <div className="flex gap-4 mb-8">
                <div 
                  onClick={() => setActiveInput(1)}
                  className={`flex-1 flex flex-col items-center justify-center p-6 rounded-2xl border-4 transition-colors ${
                    activeInput === 1 ? 'border-primary bg-primary/5' : 'border-muted bg-muted/20'
                  }`}
                >
                  <div className="text-5xl font-bold font-display tracking-tight text-foreground h-14">
                    {value1 || <span className="text-muted-foreground/30">0</span>}
                  </div>
                  <div className="text-lg font-medium text-muted-foreground mt-2">{isDouble ? "Systolic" : unit}</div>
                </div>

                {isDouble && (
                  <>
                    <div className="flex items-center text-4xl font-light text-muted-foreground">/</div>
                    <div 
                      onClick={() => setActiveInput(2)}
                      className={`flex-1 flex flex-col items-center justify-center p-6 rounded-2xl border-4 transition-colors ${
                        activeInput === 2 ? 'border-primary bg-primary/5' : 'border-muted bg-muted/20'
                      }`}
                    >
                      <div className="text-5xl font-bold font-display tracking-tight text-foreground h-14">
                        {value2 || <span className="text-muted-foreground/30">0</span>}
                      </div>
                      <div className="text-lg font-medium text-muted-foreground mt-2">Diastolic</div>
                    </div>
                  </>
                )}
              </div>

              {/* Keypad */}
              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                  <button
                    key={num}
                    onClick={() => handleKey(num.toString())}
                    className="h-20 text-3xl font-semibold bg-secondary text-secondary-foreground rounded-2xl active:scale-95 active:bg-primary active:text-primary-foreground transition-all"
                  >
                    {num}
                  </button>
                ))}
                <button
                  onClick={() => handleKey(".")}
                  className="h-20 text-4xl font-semibold bg-secondary text-secondary-foreground rounded-2xl active:scale-95 active:bg-primary active:text-primary-foreground transition-all"
                >
                  .
                </button>
                <button
                  onClick={() => handleKey("0")}
                  className="h-20 text-3xl font-semibold bg-secondary text-secondary-foreground rounded-2xl active:scale-95 active:bg-primary active:text-primary-foreground transition-all"
                >
                  0
                </button>
                <button
                  onClick={handleDelete}
                  className="h-20 flex items-center justify-center bg-muted text-muted-foreground rounded-2xl active:scale-95 active:bg-destructive active:text-destructive-foreground transition-all"
                >
                  <Delete className="w-8 h-8" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <button
                  onClick={handleClear}
                  className="h-20 text-xl font-bold bg-muted text-muted-foreground rounded-2xl active:scale-95 transition-all"
                >
                  Clear
                </button>
                <button
                  onClick={handleSave}
                  disabled={!value1 && !value2}
                  className="h-20 text-xl font-bold bg-primary text-primary-foreground rounded-2xl active:scale-95 disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary/25"
                >
                  <Check className="w-8 h-8" />
                  Save
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
