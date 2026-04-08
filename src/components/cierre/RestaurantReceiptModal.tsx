import { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Download } from "lucide-react";
import type { ProductLine } from "@/lib/cierre-store";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  date: string;
  items: ProductLine[];
  total: number;
}

const fmt = (n: number) => `$${n.toLocaleString("es-AR")}`;

function buildHtml(date: string, items: ProductLine[], total: number) {
  const rows = items
    .map(
      (item) =>
        `<tr>
          <td style="padding:4px 8px;border-bottom:1px solid #eee">${item.name}</td>
          <td style="text-align:right;padding:4px 8px;border-bottom:1px solid #eee">${item.qty}</td>
          <td style="text-align:right;padding:4px 8px;border-bottom:1px solid #eee">${fmt(item.total)}</td>
        </tr>`
    )
    .join("");

  return `<html><head><title>Comprobante Restaurante - ${date}</title>
    <style>
      body { font-family: sans-serif; padding: 20px; font-size: 14px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th { text-align: left; padding: 4px 8px; border-bottom: 1px solid #ddd; font-weight: 600; }
      .right { text-align: right; }
      .total-row td { font-weight: bold; border-top: 2px solid #333; padding: 6px 8px; }
      h2 { margin-bottom: 4px; }
      .date { color: #666; margin-bottom: 16px; }
      @media print { body { padding: 0; } }
    </style></head><body>
    <h2>Comprobante Restaurante</h2>
    <p class="date">Fecha: ${date}</p>
    <table>
      <thead><tr>
        <th>Plato</th>
        <th style="text-align:right">Cant.</th>
        <th style="text-align:right">Importe</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="total-row">
        <td colspan="2">TOTAL</td>
        <td style="text-align:right">${fmt(total)}</td>
      </tr></tfoot>
    </table>
  </body></html>`;
}

export function RestaurantReceiptModal({ open, onOpenChange, date, items, total }: Props) {
  const printRef = useRef<HTMLDivElement>(null);

  const openPrintWindow = (autoPrint: boolean) => {
    const html = buildHtml(date, items, total);
    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    if (autoPrint) {
      w.print();
      w.close();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Comprobante Restaurante</DialogTitle>
        </DialogHeader>

        <div ref={printRef}>
          <h2 style={{ marginBottom: 4 }}>Comprobante Restaurante</h2>
          <p style={{ color: "#666", marginBottom: 16 }}>Fecha: {date}</p>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #ddd" }}>Plato</th>
                <th style={{ textAlign: "right", padding: "4px 8px", borderBottom: "1px solid #ddd" }}>Cant.</th>
                <th style={{ textAlign: "right", padding: "4px 8px", borderBottom: "1px solid #ddd" }}>Importe</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.name}>
                  <td style={{ padding: "4px 8px", borderBottom: "1px solid #eee" }}>{item.name}</td>
                  <td style={{ textAlign: "right", padding: "4px 8px", borderBottom: "1px solid #eee" }}>{item.qty}</td>
                  <td style={{ textAlign: "right", padding: "4px 8px", borderBottom: "1px solid #eee" }}>{fmt(item.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} style={{ padding: "6px 8px", fontWeight: "bold", borderTop: "2px solid #333" }}>TOTAL</td>
                <td style={{ textAlign: "right", padding: "6px 8px", fontWeight: "bold", borderTop: "2px solid #333" }}>{fmt(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex gap-2 mt-2">
          <Button onClick={() => openPrintWindow(true)} className="flex-1">
            <Printer className="h-4 w-4 mr-2" /> Imprimir
          </Button>
          <Button variant="outline" onClick={() => openPrintWindow(false)} className="flex-1">
            <Download className="h-4 w-4 mr-2" /> Descargar PDF
          </Button>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Para PDF: en el diálogo de impresión elegí "Guardar como PDF"
        </p>
      </DialogContent>
    </Dialog>
  );
}
