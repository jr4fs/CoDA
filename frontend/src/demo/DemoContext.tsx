import { createContext, useContext, useState, ReactNode } from "react";

interface DemoContextValue {
  isDemo: boolean;
  tourOpen: boolean;
  setTourOpen: (v: boolean) => void;
}

const DemoContext = createContext<DemoContextValue | undefined>(undefined);

export const DemoProvider = ({ children }: { children: ReactNode }) => {
  const [tourOpen, setTourOpen] = useState(false);

  return (
    <DemoContext.Provider value={{ isDemo: true, tourOpen, setTourOpen }}>
      {children}
    </DemoContext.Provider>
  );
};

export const useDemo = (): DemoContextValue => {
  const context = useContext(DemoContext);
  if (!context) {
    return { isDemo: false, tourOpen: false, setTourOpen: () => {} };
  }
  return context;
};
