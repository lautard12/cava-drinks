import { useState, useMemo } from "react";
import { ProductWithStock, ProductType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Check, Eye } from "lucide-react";

interface CountModeProps {
  products: ProductWithStock[];
  onApply: (counts: Record<string, number>) => Promise<any> | any;
  onExit: () => void;
}

export function CountMode({ products, onApply, onExit }: CountModeProps) {
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ productId: string; diff: number }[] | null>(null);
  const [applied, setApplied] = useState(false);

  const setCount = (id: string, val: string) => {
    setCounts(prev => ({ ...prev, [id]: val }));
  };

  const diffs = useMemo(() => {
    const result: { product: ProductWithStock; diff: number; newQty: number }[] = [];
    products.forEach(p => {
      const val = counts[p.id];
      if (val !== undefined && val !== '') {
        const newQty = parseInt(val, 10);
        if (!isNaN(newQty) && newQty !== p.qty_on_hand) {
          result.push({ product: p, diff: newQty - p.qty_on_hand, newQty });
        }
      }
    });
    return result;
  }, [counts, products]);

  const handlePreview = () => setPreview(diffs.map(d => ({ productId: d.product.id, diff: d.diff })));

  const handleApply = async () => {
    const numericCounts: Record<string, number> = {};
    Object.entries(counts).forEach(([id, val]) => {
      const n = parseInt(val, 10);
      if (!isNaN(n)) numericCounts[id] = n;
    });
    await onApply(numericCounts);
    setApplied(true);
  };

  const renderTable = (filtered: ProductWithStock[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Producto</TableHead>
          <TableHead className="text-center">Stock Sistema</TableHead>
          <TableHead className="text-center">Conteo Real</TableHead>
          <TableHead className="text-center">Diferencia</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filtered.map(p => {
          const val = counts[p.id] ?? '';
          const numVal = parseInt(val, 10);
          const diff = !isNaN(numVal) ? numVal - p.qty_on_hand : null;
          return (
            <TableRow key={p.id}>
              <TableCell>
                <span className="font-medium">{p.name}</span>{' '}
                <span className="text-muted-foreground text-sm">{p.variant_label}</span>
              </TableCell>
              <TableCell className="text-center font-mono">{p.qty_on_hand}</TableCell>
              <TableCell className="text-center">
                <Input
                  type="number"
                  min="0"
                  className="w-20 mx-auto text-center"
                  value={val}
                  onChange={(e) => setCount(p.id, e.target.value)}
                  placeholder="—"
                />
              </TableCell>
              <TableCell className="text-center">
                {diff !== null && diff !== 0 ? (
                  <span className={`font-mono font-semibold ${diff > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {diff > 0 ? '+' : ''}{diff}
                  </span>
                ) : diff === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : null}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

  if (applied) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
          <Check className="h-8 w-8 text-emerald-600" />
        </div>
        <h3 className="text-lg font-semibold">Conteo aplicado</h3>
        <p className="text-muted-foreground text-sm">Se generaron los ajustes correspondientes.</p>
        <Button onClick={onExit} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver a Stock
        </Button>
      </div>
    );
  }

  const types: { label: string; value: string }[] = [
    { label: 'Todos', value: 'all' },
    { label: 'Bebidas', value: 'BEBIDAS' },
    { label: 'Snacks', value: 'SNACKS' },
    { label: 'Cigarrillos', value: 'CIGARRILLOS' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onExit}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver a modo normal
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePreview} disabled={diffs.length === 0}>
            <Eye className="mr-2 h-4 w-4" /> Previsualizar ({diffs.length})
          </Button>
          <Button onClick={handleApply} disabled={diffs.length === 0}>
            <Check className="mr-2 h-4 w-4" /> Aplicar conteo
          </Button>
        </div>
      </div>

      {preview && preview.length > 0 && (
        <div className="rounded-lg border bg-accent/30 p-4 space-y-2">
          <h4 className="font-semibold text-sm">Previsualización de ajustes</h4>
          {diffs.map(d => (
            <div key={d.product.id} className="flex justify-between text-sm">
              <span>{d.product.name} {d.product.variant_label}</span>
              <span className={`font-mono font-semibold ${d.diff > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {d.product.qty_on_hand} → {d.newQty} ({d.diff > 0 ? '+' : ''}{d.diff})
              </span>
            </div>
          ))}
        </div>
      )}

      <Tabs defaultValue="all">
        <TabsList>
          {types.map(t => (
            <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
        {types.map(t => (
          <TabsContent key={t.value} value={t.value}>
            {renderTable(t.value === 'all' ? products : products.filter(p => p.type === t.value))}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
