import { useEffect, useRef } from "react";
import QRCode from "qrcode";

export default function QRDisplay({ data, size = 120 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = "";
      const canvas = document.createElement("canvas");
      ref.current.appendChild(canvas);
      QRCode.toCanvas(canvas, data || " ", { width: size, margin: 0, color: { dark: "#000000", light: "#ffffff" } }, e => { if (e) console.error("No se pudo generar el código QR:", e); });
    }
  }, [data, size]);
  return <div ref={ref} style={{ width: size, height: size }} />;
}
