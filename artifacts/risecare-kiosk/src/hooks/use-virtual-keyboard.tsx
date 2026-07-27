import { createContext, useContext, useState, type ReactNode } from "react";

interface VirtualKeyboardContextValue {
  visible: boolean;
  setVisible: (v: boolean) => void;
}

const VirtualKeyboardContext = createContext<VirtualKeyboardContextValue>({
  visible: false,
  setVisible: () => {},
});

export function VirtualKeyboardProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  return (
    <VirtualKeyboardContext.Provider value={{ visible, setVisible }}>
      {children}
    </VirtualKeyboardContext.Provider>
  );
}

export function useVirtualKeyboard() {
  return useContext(VirtualKeyboardContext);
}
