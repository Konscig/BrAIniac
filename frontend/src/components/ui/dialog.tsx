import * as React from "react";
import ReactDOM from "react-dom";
import { Card } from "./card";

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children?: React.ReactNode;
}

export function Dialog({ isOpen, onClose, title, children }: DialogProps) {
  const elRef = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    if (!elRef.current) {
      elRef.current = document.createElement("div");
    }
    const el = elRef.current!;
    document.body.appendChild(el);
    return () => {
      if (el.parentElement) el.parentElement.removeChild(el);
    };
  }, []);

  if (!isOpen || !elRef.current) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <Card className="z-10 w-full max-w-lg p-4 mx-4">
        {title && <h3 className="mb-2 text-lg font-semibold">{title}</h3>}
        <div>{children}</div>
      </Card>
    </div>,
    elRef.current
  );
}

export default Dialog;
