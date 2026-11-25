export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function downloadCsv(csv: string, name: string) {
  downloadBlob(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }), name);
}

/** Exports every chart (svg.recharts-surface) inside `root` as PNG. Returns count. */
export async function exportCharts(root: HTMLElement | Document, baseName: string): Promise<number> {
  const svgs = Array.from(root.querySelectorAll<SVGSVGElement>("svg.recharts-surface")).filter((s) => s.clientWidth > 100);
  for (const [i, svg] of svgs.entries()) await svgToPng(svg, `${baseName}${svgs.length > 1 ? "-" + (i + 1) : ""}.png`);
  return svgs.length;
}

async function svgToPng(svg: SVGSVGElement, name: string) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const src = svg.querySelectorAll("*"), dst = clone.querySelectorAll("*");
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    const d = dst[i] as SVGElement;
    for (const p of ["fill", "stroke", "stroke-width", "stroke-dasharray", "opacity", "font-size", "font-family", "font-weight"]) d.style.setProperty(p, cs.getPropertyValue(p));
  });
  const w = svg.clientWidth, h = svg.clientHeight;
  clone.setAttribute("width", String(w)); clone.setAttribute("height", String(h));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
  const img = new Image();
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = url; });
  const c = document.createElement("canvas");
  c.width = w * 2; c.height = h * 2;
  const ctx = c.getContext("2d");
  if (!ctx) { URL.revokeObjectURL(url); throw new Error("Tidak dapat menyiapkan ekspor grafik."); }
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--card").trim(); ctx.fillRect(0, 0, c.width, c.height);
  ctx.scale(2, 2); ctx.drawImage(img, 0, 0);
  URL.revokeObjectURL(url);
  await new Promise<void>((res) => c.toBlob((b) => { if (b) downloadBlob(b, name); res(); }));
}
