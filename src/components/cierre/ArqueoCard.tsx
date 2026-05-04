import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Banknote, Smartphone, AlertTriangle, CheckCircle2, Save } from "lucide-react";
import { toast } from "sonner";
import {
  fetchCapitalRange,
  fetchCashCountsForDate,
  upsertCashCount,
  type CapitalSnapshot,
  type CashCount,
  type Fund,
} from "@/lib/finanzas-store";
import { useAuth } from "@/hooks/useAuth";

const fmt = (n: number) => `$${n.toLocaleString("es-AR")}`;

const FUND_LABELS: Record<Fund, string> = {
  EFECTIVO: "Efectivo",
  MERCADOPAGO: "MercadoPago",
};

const FundIcon = ({ fund }: { fund: Fund }) =>
  fund === "EFECTIVO" ? <Banknote className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />;

interface Props {
  date: string;
}

export function ArqueoCard({ date }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: capital } = useQuery<CapitalSnapshot>({
    queryKey: ["arqueo-capital", date],
    queryFn: () => fetchCapitalRange(date, date),
  });

  const { data: existing = [] } = useQuery<CashCount[]>({
    queryKey: ["arqueo-counts", date],
    queryFn: () => fetchCashCountsForDate(date),
  });

  const existingByFund = useMemo(() => {
    const m: Record<string, CashCount> = {};
    for (const c of existing) m[c.fund] = c;
    return m;
  }, [existing]);

  // Estado local del input por fondo (string para permitir vacío).
  const [counts, setCounts] = useState<Record<Fund, string>>({
    EFECTIVO: "",
    MERCADOPAGO: "",
  });
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState<Fund | null>(null);

  // Sincronizar inputs con los conteos ya guardados.
  useEffect(() => {
    setCounts({
      EFECTIVO: existingByFund.EFECTIVO ? String(existingByFund.EFECTIVO.counted_amount) : "",
      MERCADOPAGO: existingByFund.MERCADOPAGO ? String(existingByFund.MERCADOPAGO.counted_amount) : "",
    });
    // Si todos los conteos comparten la misma nota, mostrarla.
    const sample = existing[0]?.notes ?? "";
    setNotes(sample);
  }, [existingByFund, existing]);

  const handleSave = async (fund: Fund, expected: number) => {
    const raw = counts[fund];
    if (raw.trim() === "") {
      toast.error("Ingresá el monto contado");
      return;
    }
    const counted = parseInt(raw);
    if (isNaN(counted) || counted < 0) {
      toast.error("Monto inválido");
      return;
    }

    setSaving(fund);
    try {
      await upsertCashCount({
        date,
        fund,
        expected_amount: expected,
        counted_amount: counted,
        notes: notes.trim() || undefined,
        counted_by: user?.id,
        counted_by_name: user?.user_metadata?.display_name || user?.email || "",
      });
      qc.invalidateQueries({ queryKey: ["arqueo-counts", date] });
      toast.success(`${FUND_LABELS[fund]}: arqueo guardado`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(null);
    }
  };

  if (!capital) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Arqueo de caja</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Cargando…</p></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Arqueo de caja</CardTitle>
        <CardDescription>
          Ingresá lo que contaste físicamente al cierre. La diferencia con lo esperado queda registrada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {capital.funds.map((row) => {
          const existingCount = existingByFund[row.fund];
          const counted = parseInt(counts[row.fund] || "0") || 0;
          const liveDiff = counted - row.esperado;
          const isAlreadySaved = !!existingCount;
          const savedDiff = existingCount?.difference ?? 0;
          const isSavingThis = saving === row.fund;

          return (
            <div key={row.fund} className="rounded-md border p-3 space-y-2 bg-muted/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FundIcon fund={row.fund} />
                  <span className="font-medium">{FUND_LABELS[row.fund]}</span>
                  {isAlreadySaved && (
                    <Badge variant="outline" className="text-[10px]">Guardado</Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  Esperado: <strong className="text-foreground">{fmt(row.esperado)}</strong>
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Contado</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={counts[row.fund]}
                    onChange={(e) => setCounts((p) => ({ ...p, [row.fund]: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Diferencia</Label>
                  <DiffBadge
                    diff={counts[row.fund].trim() === "" ? (isAlreadySaved ? savedDiff : 0) : liveDiff}
                    untouched={counts[row.fund].trim() === "" && !isAlreadySaved}
                  />
                </div>
              </div>

              <Button
                size="sm"
                variant={isAlreadySaved ? "outline" : "default"}
                className="w-full"
                disabled={isSavingThis || counts[row.fund].trim() === ""}
                onClick={() => handleSave(row.fund, row.esperado)}
              >
                <Save className="h-3.5 w-3.5 mr-1" />
                {isSavingThis ? "Guardando…" : isAlreadySaved ? "Actualizar arqueo" : "Guardar arqueo"}
              </Button>
            </div>
          );
        })}

        <div className="space-y-1 pt-2 border-t">
          <Label className="text-xs">Notas (opcional)</Label>
          <Textarea
            rows={2}
            placeholder="Ej: faltante por vuelto mal dado, sobrante de propina, etc."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <p className="text-[10px] text-muted-foreground">
            La nota se guarda con el próximo arqueo que registres.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function DiffBadge({ diff, untouched }: { diff: number; untouched: boolean }) {
  if (untouched) {
    return (
      <div className="h-10 rounded-md border flex items-center justify-center text-sm text-muted-foreground">
        —
      </div>
    );
  }
  if (diff === 0) {
    return (
      <div className="h-10 rounded-md border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/20 flex items-center justify-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-4 w-4" /> Cuadra
      </div>
    );
  }
  const isFaltante = diff < 0;
  return (
    <div
      className={`h-10 rounded-md border flex items-center justify-center gap-1 text-sm font-medium ${
        isFaltante
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400"
      }`}
    >
      <AlertTriangle className="h-4 w-4" />
      {isFaltante ? `Faltan ${fmt(Math.abs(diff))}` : `Sobran ${fmt(diff)}`}
    </div>
  );
}
