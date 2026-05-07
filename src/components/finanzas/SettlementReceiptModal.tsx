import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Download } from "lucide-react";
import { format } from "date-fns";
import {
  fetchSettlementDetail,
  type RestaurantSettlement,
  type SettlementDetail,
} from "@/lib/restaurant-settlement-store";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  settlement: RestaurantSettlement | null;
}

const fmt = (n: number) => `$${n.toLocaleString("es-AR")}`;
const FUND_LABEL: Record<string, string> = {
  EFECTIVO: "Efectivo",
  MERCADOPAGO: "MercadoPago",
};

const fmtDate = (d: string) => format(new Date(d + "T12:00:00"), "dd/MM/yyyy");

function buildHtml(s: RestaurantSettlement, detail: SettlementDetail | null) {
  const dateLabel = fmtDate(s.date);
  const issuedAt = format(new Date(s.created_at), "dd/MM/yyyy HH:mm");
  const periodLabel =
    s.period_from && s.period_to
      ? `${fmtDate(s.period_from)} a ${fmtDate(s.period_to)}`
      : null;

  const detailRows =
    detail && detail.lines.length > 0
      ? detail.lines
          .map(
            (l) =>
              `<tr>
            <td style="padding:4px 8px;border-bottom:1px solid #eee">${l.name}</td>
            <td style="text-align:right;padding:4px 8px;border-bottom:1px solid #eee">${l.qty}</td>
            <td style="text-align:right;padding:4px 8px;border-bottom:1px solid #eee">${fmt(l.total)}</td>
          </tr>`,
          )
          .join("")
      : "";

  const detailSection =
    periodLabel && detail
      ? `
      <h3 style="margin:20px 0 4px;font-size:14px">Detalle del período (${periodLabel})</h3>
      <p style="color:#666;margin:0 0 8px;font-size:12px">${detail.ticketCount} ticket(s) con comida</p>
      ${
        detail.lines.length === 0
          ? `<p style="color:#999;font-style:italic">Sin platos vendidos en este período.</p>`
          : `
        <table style="width:100%;border-collapse:collapse;margin-top:6px">
          <thead><tr>
            <th style="text-align:left;padding:4px 8px;border-bottom:1px solid #ddd">Plato</th>
            <th style="text-align:right;padding:4px 8px;border-bottom:1px solid #ddd">Cant.</th>
            <th style="text-align:right;padding:4px 8px;border-bottom:1px solid #ddd">Importe</th>
          </tr></thead>
          <tbody>${detailRows}</tbody>
          ${
            detail.deliveryFee > 0
              ? `<tfoot><tr>
              <td colspan="2" style="padding:4px 8px;color:#555">Envíos (delivery_fee)</td>
              <td style="text-align:right;padding:4px 8px">${fmt(detail.deliveryFee)}</td>
            </tr></tfoot>`
              : ""
          }
        </table>
        <div class="row" style="margin-top:8px"><span class="label">Total vendido al restaurante</span><span><strong>${fmt(detail.totalVendido)}</strong></span></div>
      `
      }`
      : !periodLabel
        ? `<p style="color:#999;font-size:12px;margin-top:16px;font-style:italic">Esta rendición no tiene período asociado (registro anterior al sistema de períodos).</p>`
        : "";

  return `<html><head><title>Recibo Rendición - ${dateLabel}</title>
    <style>
      body { font-family: sans-serif; padding: 24px; font-size: 14px; max-width: 540px; margin: 0 auto; color: #111; }
      h2 { margin: 0 0 4px; }
      .subtitle { color: #666; margin-bottom: 20px; font-size: 13px; }
      .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
      .row.total { border-top: 2px solid #333; border-bottom: none; margin-top: 8px; padding-top: 12px; font-weight: bold; font-size: 16px; }
      .label { color: #555; }
      .notes { margin-top: 16px; padding: 10px; background: #f7f7f7; border-radius: 4px; font-size: 13px; white-space: pre-wrap; }
      .footer { margin-top: 24px; font-size: 11px; color: #888; text-align: center; }
      @media print { body { padding: 0; } }
    </style></head><body>
    <h2>Recibo de rendición al restaurante</h2>
    <p class="subtitle">Emitido el ${issuedAt}</p>
    <div class="row"><span class="label">Fecha de pago</span><span>${dateLabel}</span></div>
    ${periodLabel ? `<div class="row"><span class="label">Período cubierto</span><span>${periodLabel}</span></div>` : ""}
    <div class="row"><span class="label">Fondo</span><span>${FUND_LABEL[s.fund] ?? s.fund}</span></div>
    <div class="row total"><span>Monto entregado</span><span>${fmt(s.amount)}</span></div>
    ${s.notes ? `<div class="notes"><strong>Notas:</strong><br/>${s.notes}</div>` : ""}
    ${detailSection}
    <div class="footer">ID: ${s.id}</div>
  </body></html>`;
}

export function SettlementReceiptModal({ open, onOpenChange, settlement }: Props) {
  const hasPeriod = !!(settlement?.period_from && settlement?.period_to);

  const detailQ = useQuery({
    queryKey: ["settlement-detail", settlement?.id],
    queryFn: () => fetchSettlementDetail(settlement!.period_from!, settlement!.period_to!),
    enabled: open && hasPeriod,
  });

  if (!settlement) return null;

  const dateLabel = fmtDate(settlement.date);
  const issuedAt = format(new Date(settlement.created_at), "dd/MM/yyyy HH:mm");
  const periodLabel = hasPeriod
    ? `${fmtDate(settlement.period_from!)} a ${fmtDate(settlement.period_to!)}`
    : null;

  const openPrintWindow = (autoPrint: boolean) => {
    const html = buildHtml(settlement, detailQ.data ?? null);
    const w = window.open("", "_blank", "width=540,height=720");
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
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Recibo de rendición</DialogTitle>
        </DialogHeader>

        <div className="space-y-1 text-sm">
          <h3 className="font-semibold text-base mb-1">Recibo de rendición al restaurante</h3>
          <p className="text-xs text-muted-foreground mb-3">Emitido el {issuedAt}</p>

          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">Fecha de pago</span>
            <span>{dateLabel}</span>
          </div>
          {periodLabel && (
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Período cubierto</span>
              <span>{periodLabel}</span>
            </div>
          )}
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">Fondo</span>
            <span>{FUND_LABEL[settlement.fund] ?? settlement.fund}</span>
          </div>
          <div className="flex justify-between pt-3 mt-2 border-t-2 font-bold text-base">
            <span>Monto entregado</span>
            <span>{fmt(settlement.amount)}</span>
          </div>

          {settlement.notes && (
            <div className="mt-4 p-3 rounded-md bg-muted text-sm whitespace-pre-wrap">
              <strong>Notas:</strong>
              <br />
              {settlement.notes}
            </div>
          )}

          {/* Detalle del período */}
          {hasPeriod ? (
            <div className="mt-5">
              <h4 className="font-semibold text-sm mb-1">Detalle del período</h4>
              {detailQ.isLoading ? (
                <p className="text-muted-foreground text-xs">Cargando…</p>
              ) : !detailQ.data || detailQ.data.lines.length === 0 ? (
                <p className="text-muted-foreground text-xs italic">Sin platos vendidos en este período.</p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground mb-2">
                    {detailQ.data.ticketCount} ticket(s) con comida
                  </p>
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-2 py-1.5 font-medium">Plato</th>
                          <th className="text-right px-2 py-1.5 font-medium">Cant.</th>
                          <th className="text-right px-2 py-1.5 font-medium">Importe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailQ.data.lines.map((l) => (
                          <tr key={l.name} className="border-t">
                            <td className="px-2 py-1.5">{l.name}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{l.qty}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{fmt(l.total)}</td>
                          </tr>
                        ))}
                        {detailQ.data.deliveryFee > 0 && (
                          <tr className="border-t text-muted-foreground">
                            <td className="px-2 py-1.5" colSpan={2}>Envíos (delivery_fee)</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{fmt(detailQ.data.deliveryFee)}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-between mt-2 pt-2 border-t font-semibold">
                    <span>Total vendido al restaurante</span>
                    <span className="tabular-nums">{fmt(detailQ.data.totalVendido)}</span>
                  </div>
                </>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-xs italic mt-4">
              Esta rendición no tiene período asociado (registro anterior al sistema de períodos).
            </p>
          )}
        </div>

        <div className="flex gap-2 mt-2">
          <Button onClick={() => openPrintWindow(true)} className="flex-1" disabled={hasPeriod && detailQ.isLoading}>
            <Printer className="h-4 w-4 mr-2" /> Imprimir
          </Button>
          <Button
            variant="outline"
            onClick={() => openPrintWindow(false)}
            className="flex-1"
            disabled={hasPeriod && detailQ.isLoading}
          >
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
