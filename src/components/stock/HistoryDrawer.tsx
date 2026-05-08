import { useState, useMemo } from "react";
import { StockMovement, Product, MovementType } from "@/lib/types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface HistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  movements: (StockMovement & { product?: Product })[];
}

const movementLabels: Record<MovementType, { label: string; className: string }> = {
  PURCHASE: { label: 'Compra', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  WASTE: { label: 'Rotura', className: 'bg-red-100 text-red-800 border-red-200' },
  SALE: { label: 'Venta', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  ADJUST: { label: 'Ajuste', className: 'bg-amber-100 text-amber-800 border-amber-200' },
};

const countReasonLabels: Record<string, string> = {
  ROTURA: 'Rotura',
  HURTO: 'Hurto',
  ERROR_CARGA: 'Error de carga',
  VENCIMIENTO: 'Vencimiento',
  OTRO: 'Otro',
};

// Parsea reasons generados por apply_inventory_count_atomic.
// Formato: "Conteo {start}..{end} | {REASON_CODE}[: {note}]"
function parseCountReason(reason: string): { period: string; reasonLabel: string; note: string } | null {
  if (!reason?.startsWith('Conteo ')) return null;
  const m = reason.match(/^Conteo (\S+)\.\.(\S+) \| ([A-Z_]+)(?:: (.+))?$/);
  if (!m) return null;
  const [, start, end, code, note] = m;
  return {
    period: `${start} al ${end}`,
    reasonLabel: countReasonLabels[code] ?? code,
    note: note ?? '',
  };
}

export function HistoryDrawer({ open, onClose, movements }: HistoryDrawerProps) {
  const [filterType, setFilterType] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return movements.filter(m => {
      if (filterType !== 'all' && m.type !== filterType) return false;
      if (search) {
        const term = search.toLowerCase();
        const name = m.product?.name?.toLowerCase() ?? '';
        const reason = m.reason?.toLowerCase() ?? '';
        if (!name.includes(term) && !reason.includes(term)) return false;
      }
      return true;
    });
  }, [movements, filterType, search]);

  // Convención: stock_movements.qty siempre se guarda absoluto. El signo visible
  // depende del tipo: SALE y WASTE restan stock; PURCHASE suma; ADJUST puede ser
  // ambos (se respeta el signo guardado, que viene de counted - system).
  const displayQty = (m: StockMovement) => {
    if (m.type === 'SALE' || m.type === 'WASTE') return -Math.abs(m.qty);
    if (m.type === 'PURCHASE') return Math.abs(m.qty);
    return m.qty;
  };
  const formatQty = (m: StockMovement) => {
    const q = displayQty(m);
    return q > 0 ? `+${q}` : `${q}`;
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-auto">
        <SheetHeader>
          <SheetTitle>Historial de Movimientos</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Buscar producto o razón..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1"
            />
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="PURCHASE">Compra</SelectItem>
                <SelectItem value="WASTE">Rotura</SelectItem>
                <SelectItem value="SALE">Venta</SelectItem>
                <SelectItem value="ADJUST">Ajuste</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead>Razón</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Sin movimientos
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((m) => {
                const config = movementLabels[m.type];
                const parsed = m.type === 'ADJUST' ? parseCountReason(m.reason ?? '') : null;
                return (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(m.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {m.product?.name ?? '?'} <span className="text-muted-foreground">{m.product?.variant_label}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={config.className}>{config.label}</Badge>
                    </TableCell>
                    <TableCell className={`text-right font-mono font-semibold ${displayQty(m) > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatQty(m)}
                    </TableCell>
                    <TableCell className="text-xs max-w-[180px]">
                      {parsed ? (
                        <div className="flex flex-col gap-0.5">
                          <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200 w-fit text-[10px] py-0">
                            Conteo · {parsed.reasonLabel}
                          </Badge>
                          <span className="text-muted-foreground truncate">
                            {parsed.note ? parsed.note : parsed.period}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground truncate block">{m.reason}</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </SheetContent>
    </Sheet>
  );
}
