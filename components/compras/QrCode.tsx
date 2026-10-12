"use client";

import { QRCodeSVG } from "qrcode.react";

interface Props {
  value: string;
  size?: number;
}

/** QR sobre fondo blanco (contraste mínimo para que escanee bien aunque la UI sea oscura). */
export function QrCode({ value, size = 220 }: Props) {
  return (
    <div className="inline-block rounded-xl bg-white p-3">
      <QRCodeSVG value={value} size={size} level="M" bgColor="#FFFFFF" fgColor="#000000" />
    </div>
  );
}
