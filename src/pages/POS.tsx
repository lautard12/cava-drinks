import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchActiveProductsWithPrices,
  fetchActiveRestaurantItems,
  createSale,
  type CartItem,
  type Channel,
  type PaymentLine,
  type ActiveProduct,
} from "@/lib/pos-store";
import {
  createOpenTab,
  addItemToTab,
  removeItemFromTab,
  updateItemQtyInTab,
  sendToKitchen,
  closeTab,
  fetchTabItems,
  updateTabPriceTerm,
  type OpenTab,
  type TabSaleItem,
} from "@/lib/tab-store";
import { fetchRestaurantCategories } from "@/lib/restaurant-store";
import { fetchSurchargeTiers, type SurchargeTier } from "@/lib/price-store";
import {
  fetchActiveOffersForPOS,
  consolidateStockRequirements,
  type OfferWithItems,
} from "@/lib/offer-store";
import { CheckoutModal } from "@/components/pos/CheckoutModal";
import { OpenTabsSheet } from "@/components/pos/OpenTabsSheet";
import { NewTabDialog } from "@/components/pos/NewTabDialog";
import { OffersSheet } from "@/components/pos/OffersSheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ShoppingCart, Plus, Minus, Trash2, Search, AlertCircle,
  ClipboardList, PlusCircle, UtensilsCrossed, X, Tag, ChevronDown, Package, Pencil,
} from "lucide-react";

let cartIdCounter = 0;

function EditablePrice({ price, itemId, isOffer, disabled, onUpdate }: {
  price: number; itemId: string; isOffer: boolean; disabled?: boolean;
  onUpdate: (id: string, newPrice: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (isOffer || disabled) {
    return <span className="text-xs text-muted-foreground">${price.toLocaleString("es-AR")} c/u</span>;
  }

  if (editing) {
    return (
      <input
        type="number"
        className="w-20 text-xs text-right border border-primary/40 rounded px-1 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.currentTarget.blur(); }
          if (e.key === "Escape") { setEditing(false); }
        }}
        onBlur={() => {
          const val = parseInt(draft, 10);
          if (!isNaN(val) && val > 0 && val !== price) onUpdate(itemId, val);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className="text-xs text-muted-foreground border-b border-dashed border-muted-foreground/40 hover:text-primary hover:border-primary cursor-pointer inline-flex items-center gap-0.5 transition-colors"
      onClick={() => { setDraft(String(price)); setEditing(true); }}
    >
      ${price.toLocaleString("es-AR")} c/u <Pencil className="h-2.5 w-2.5 opacity-50" />
    </button>
  );
}

export default function POS() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();

  // Settings
  const [channel, setChannel] = useState<Channel>("RESTAURANTE");
  const [priceTerm, setPriceTerm] = useState<string>("BASE");
  const [deliveryFee, setDeliveryFee] = useState(0);

  // Cart (local state for DELIVERY, DB-backed for RESTAURANTE tabs)
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Tab state (RESTAURANTE only)
  const [activeTab, setActiveTab] = useState<{ id: string; tab_name: string | null } | null>(null);
  const [tabItems, setTabItems] = useState<TabSaleItem[]>([]);
  const [tabsSheetOpen, setTabsSheetOpen] = useState(false);
  const [newTabOpen, setNewTabOpen] = useState(false);
  const [creatingTab, setCreatingTab] = useState(false);
  const [tabOperating, setTabOperating] = useState(false);

  // Mobile cart sheet & offers
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [offersSheetOpen, setOffersSheetOpen] = useState(false);
  const [activeItemTab, setActiveItemTab] = useState("local");

  // Search
  const [localSearch, setLocalSearch] = useState("");
  const [localTypeFilter, setLocalTypeFilter] = useState("ALL");
  const [localCatFilter, setLocalCatFilter] = useState("ALL");
  const [localStockOnly, setLocalStockOnly] = useState(false);
  const [foodSearch, setFoodSearch] = useState("");
  const [foodCatFilter, setFoodCatFilter] = useState("ALL");
  const [foodNoteInput, setFoodNoteInput] = useState<Record<string, string>>({});

  // Data
  const { data: products = [], isLoading: loadingP } = useQuery({
    queryKey: ["pos-products"],
    queryFn: fetchActiveProductsWithPrices,
  });
  const { data: restaurantItems = [], isLoading: loadingR } = useQuery({
    queryKey: ["pos-restaurant-items"],
    queryFn: fetchActiveRestaurantItems,
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["restaurant-categories"],
    queryFn: fetchRestaurantCategories,
  });
  const { data: surchargeTiers = [] } = useQuery<SurchargeTier[]>({
    queryKey: ["surcharge-tiers"],
    queryFn: fetchSurchargeTiers,
  });
  const { data: activeOffers = [] } = useQuery({
    queryKey: ["pos-active-offers"],
    queryFn: fetchActiveOffersForPOS,
  });

  const isTabMode = channel === "RESTAURANTE" && activeTab !== null;

  // Build term labels from dynamic tiers
  const termLabels = useMemo(() => {
    const labels: Record<string, string> = { BASE: "Efectivo" };
    for (const t of surchargeTiers) labels[t.slug] = t.name;
    return labels;
  }, [surchargeTiers]);

  const allTerms = useMemo(() => ["BASE", ...surchargeTiers.map(t => t.slug)], [surchargeTiers]);

  // Helper: get surcharge multiplier for restaurant items based on price term
  const getFoodSurchargeMultiplier = (term: string) => {
    if (term === "BASE") return 1;
    const tier = surchargeTiers.find(t => t.slug === term);
    return tier ? 1 + tier.percentage / 100 : 1;
  };

  const applyFoodSurcharge = (basePrice: number, term: string) => {
    return Math.round(basePrice * getFoodSurchargeMultiplier(term));
  };

  const getCostMap = useCallback(() => {
    const costMap: Record<string, number> = {};
    for (const p of products) costMap[p.id] = p.cost_price ?? 0;
    return costMap;
  }, [products]);

  const getSurchargePct = useCallback(() => {
    if (priceTerm === "BASE") return 0;
    const tier = surchargeTiers.find(t => t.slug === priceTerm);
    return tier?.percentage ?? 0;
  }, [priceTerm, surchargeTiers]);

  // Stock map for offer validation
  const stockMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of products) m[p.id] = p.qty_on_hand;
    return m;
  }, [products]);

  // Cart requirements for offer stock validation
  const cartStockRequirements = useMemo(() => {
    const req: Record<string, number> = {};
    const items = isTabMode ? tabItems : cart;
    for (const ci of items) {
      const ciAny = ci as any;
      if (ciAny.item_type === "PRODUCT" && ciAny.product_id) {
        req[ciAny.product_id] = (req[ciAny.product_id] ?? 0) + ci.qty;
      } else if (ciAny.item_type === "OFFER" && ciAny.offer_id) {
        const offer = activeOffers.find((o) => o.id === ciAny.offer_id);
        if (offer) {
          for (const oi of offer.items) {
            if (oi.track_stock) {
              req[oi.product_id] = (req[oi.product_id] ?? 0) + oi.qty * ci.qty;
            }
          }
        }
      }
    }
    return req;
  }, [isTabMode, tabItems, cart, activeOffers, products]);

  // Add offer to cart/tab
  const addOffer = async (offer: OfferWithItems) => {
    if (isTabMode) {
      setTabOperating(true);
      try {
        const costMap = getCostMap();
        const totalCost = offer.items.reduce((s, oi) => s + (costMap[oi.product_id] ?? 0) * oi.qty, 0);
        const item: CartItem = {
          id: `temp-${++cartIdCounter}`,
          owner: "LOCAL",
          item_type: "OFFER" as any,
          name: offer.name,
          variant: "",
          qty: 1,
          unit_price: offer.offer_price,
          notes: "",
          track_stock: false,
          offer_id: offer.id,
          offer_name_snapshot: offer.name,
          offer_price_snapshot: offer.offer_price,
          _offer_items: offer.items,
          _cost_snapshot: totalCost,
        } as any;
        await addItemToTab(activeTab!.id, item, costMap);
        await reloadTabItems(activeTab!.id);
        toast({ title: `Oferta "${offer.name}" agregada` });
      } catch (e: any) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      } finally {
        setTabOperating(false);
      }
    } else {
      const existing = cart.find((c) => (c as any).offer_id === offer.id);
      if (existing) {
        setCart((prev) => prev.map((c) => (c.id === existing.id ? { ...c, qty: c.qty + 1 } : c)));
      } else {
        const costMap = getCostMap();
        const totalCost = offer.items.reduce((s, oi) => s + (costMap[oi.product_id] ?? 0) * oi.qty, 0);
        setCart((prev) => [
          ...prev,
          {
            id: `cart-${++cartIdCounter}`,
            owner: "LOCAL",
            item_type: "OFFER" as any,
            name: offer.name,
            variant: "",
            qty: 1,
            unit_price: offer.offer_price,
            notes: "",
            track_stock: false,
            offer_id: offer.id,
            offer_name_snapshot: offer.name,
            offer_price_snapshot: offer.offer_price,
            _offer_items: offer.items,
            _cost_snapshot: totalCost,
          } as any,
        ]);
      }
      toast({ title: `Oferta "${offer.name}" agregada` });
    }
    setOffersSheetOpen(false);
  };


  const reloadTabItems = useCallback(async (saleId: string) => {
    const items = await fetchTabItems(saleId);
    setTabItems(items);
  }, []);

  // Filtered products
  const localCategories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => {
      if (localTypeFilter === "ALL" || p.type === localTypeFilter) {
        if (p.category) cats.add(p.category);
      }
    });
    return Array.from(cats).sort();
  }, [products, localTypeFilter]);

  const filteredProducts = useMemo(() => {
    let items = products;
    if (localTypeFilter !== "ALL") items = items.filter((p) => p.type === localTypeFilter);
    if (localCatFilter !== "ALL") items = items.filter((p) => p.category === localCatFilter);
    if (localStockOnly) items = items.filter((p) => !p.track_stock || p.qty_on_hand > 0);
    const s = localSearch.toLowerCase();
    if (s) {
      items = items.filter(
        (p) => p.name.toLowerCase().includes(s) || p.variant_label.toLowerCase().includes(s) || p.category.toLowerCase().includes(s)
      );
    }
    return items.sort((a, b) => {
      const aHas = !a.track_stock || a.qty_on_hand > 0 ? 0 : 1;
      const bHas = !b.track_stock || b.qty_on_hand > 0 ? 0 : 1;
      if (aHas !== bHas) return aHas - bHas;
      return a.name.localeCompare(b.name);
    });
  }, [products, localSearch, localTypeFilter, localCatFilter, localStockOnly]);

  const filteredFood = useMemo(() => {
    let items = restaurantItems.filter((i) => !i.is_offer);
    if (foodCatFilter !== "ALL") items = items.filter((i) => i.category_id === foodCatFilter);
    const s = foodSearch.toLowerCase();
    if (s) items = items.filter((i) => i.name.toLowerCase().includes(s));
    return items;
  }, [restaurantItems, foodSearch, foodCatFilter]);

  const filteredFoodOffers = useMemo(() => {
    let items = restaurantItems.filter((i) => i.is_offer);
    const s = foodSearch.toLowerCase();
    if (s) items = items.filter((i) => i.name.toLowerCase().includes(s));
    return items;
  }, [restaurantItems, foodSearch]);

  // === Cart items for display (tab mode uses tabItems, delivery uses local cart) ===
  const displayItems: (CartItem & { _sent_to_kitchen?: boolean; _offer_items?: any[] })[] = useMemo(() => {
    if (!isTabMode) return cart;
    return tabItems.map((ti) => ({
      id: ti.id,
      owner: ti.owner as any,
      item_type: ti.item_type as any,
      product_id: ti.product_id ?? undefined,
      restaurant_item_id: ti.restaurant_item_id ?? undefined,
      name: ti.name_snapshot + (ti.variant_snapshot ? ` ${ti.variant_snapshot}` : ""),
      variant: ti.variant_snapshot,
      qty: ti.qty,
      unit_price: ti.unit_price,
      notes: ti.notes,
      track_stock: false,
      _sent_to_kitchen: ti.sent_to_kitchen,
      offer_id: ti.offer_id ?? undefined,
      offer_name_snapshot: ti.offer_name_snapshot ?? undefined,
      offer_price_snapshot: ti.offer_price_snapshot ?? undefined,
      _offer_items: ti.offer_id ? activeOffers.find((o) => o.id === ti.offer_id)?.items : undefined,
    }));
  }, [isTabMode, cart, tabItems, activeOffers]);

  const hasUnsentKitchenItems = useMemo(() => {
    if (isTabMode) {
      return tabItems.some((i) => i.owner === "RESTAURANTE" && !i.sent_to_kitchen);
    }
    // Non-tab mode: cart has restaurant items that need kitchen
    return cart.some((i) => i.owner === "RESTAURANTE");
  }, [isTabMode, tabItems, cart]);

  // Cart helpers
  const addLocalProduct = async (p: ActiveProduct) => {
    const priceKey = `${channel}_${priceTerm}`;
    const price = p.prices[priceKey];
    if (!price || price <= 0) {
      toast({ title: "Falta precio", description: `No hay precio para ${channel} / ${termLabels[priceTerm] ?? priceTerm}`, variant: "destructive" });
      return;
    }

    if (isTabMode) {
      // Check if already exists in tab items
      const existing = tabItems.find((ti) => ti.product_id === p.id);
      if (existing) {
        if (p.track_stock && existing.qty + 1 > p.qty_on_hand) {
          toast({ title: "Stock insuficiente", description: `Disponible: ${p.qty_on_hand}`, variant: "destructive" });
          return;
        }
        setTabOperating(true);
        try {
          await updateItemQtyInTab(existing.id, activeTab!.id, existing.qty + 1);
          await reloadTabItems(activeTab!.id);
        } catch (e: any) {
          toast({ title: "Error", description: e.message, variant: "destructive" });
        } finally {
          setTabOperating(false);
        }
      } else {
        if (p.track_stock && p.qty_on_hand < 1) {
          toast({ title: "Sin stock", description: p.name, variant: "destructive" });
          return;
        }
        setTabOperating(true);
        try {
          const basePrice = p.prices[`${channel}_BASE`] ?? price;
          const item: CartItem = {
            id: `temp-${++cartIdCounter}`,
            owner: "LOCAL",
            item_type: "PRODUCT",
            product_id: p.id,
            name: p.name + (p.variant_label ? ` ${p.variant_label}` : ""),
            variant: p.variant_label,
            qty: 1,
            unit_price: price,
            unit_price_base: basePrice,
            notes: "",
            track_stock: p.track_stock,
          };
          await addItemToTab(activeTab!.id, item, getCostMap());
          await reloadTabItems(activeTab!.id);
        } catch (e: any) {
          toast({ title: "Error", description: e.message, variant: "destructive" });
        } finally {
          setTabOperating(false);
        }
      }
      return;
    }

    // DELIVERY mode: local cart
    const existing = cart.find((c) => c.product_id === p.id);
    if (existing) {
      if (p.track_stock && existing.qty + 1 > p.qty_on_hand) {
        toast({ title: "Stock insuficiente", description: `Disponible: ${p.qty_on_hand}`, variant: "destructive" });
        return;
      }
      setCart((prev) =>
        prev.map((c) => (c.id === existing.id ? { ...c, qty: c.qty + 1, unit_price: price } : c))
      );
    } else {
      if (p.track_stock && p.qty_on_hand < 1) {
        toast({ title: "Sin stock", description: p.name, variant: "destructive" });
        return;
      }
      const basePrice = p.prices[`${channel}_BASE`] ?? price;
      setCart((prev) => [
        ...prev,
        {
          id: `cart-${++cartIdCounter}`,
          owner: "LOCAL",
          item_type: "PRODUCT",
          product_id: p.id,
          name: p.name + (p.variant_label ? ` ${p.variant_label}` : ""),
          variant: p.variant_label,
          qty: 1,
          unit_price: price,
          unit_price_base: basePrice,
          notes: "",
          track_stock: p.track_stock,
        },
      ]);
    }
  };

  const addFoodItem = async (item: { id: string; name: string; price: number }) => {
    const note = foodNoteInput[item.id] || "";
    const surchargedPrice = applyFoodSurcharge(item.price, priceTerm);

    if (isTabMode) {
      setTabOperating(true);
      try {
        const cartItem: CartItem = {
          id: `temp-${++cartIdCounter}`,
          owner: "RESTAURANTE",
          item_type: "RESTAURANT_ITEM",
          restaurant_item_id: item.id,
          name: item.name,
          variant: "",
          qty: 1,
          unit_price: surchargedPrice,
          unit_price_base: item.price,
          notes: note,
          track_stock: false,
        };
        await addItemToTab(activeTab!.id, cartItem, getCostMap());
        await reloadTabItems(activeTab!.id);
      } catch (e: any) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      } finally {
        setTabOperating(false);
      }
      setFoodNoteInput((prev) => ({ ...prev, [item.id]: "" }));
      return;
    }

    setCart((prev) => [
      ...prev,
      {
        id: `cart-${++cartIdCounter}`,
        owner: "RESTAURANTE",
        item_type: "RESTAURANT_ITEM",
        restaurant_item_id: item.id,
        name: item.name,
        variant: "",
        qty: 1,
        unit_price: surchargedPrice,
        unit_price_base: item.price,
        notes: note,
        track_stock: false,
      },
    ]);
    setFoodNoteInput((prev) => ({ ...prev, [item.id]: "" }));
  };

  const updateQty = async (cartId: string, delta: number) => {
    if (isTabMode) {
      const ti = tabItems.find((i) => i.id === cartId);
      if (!ti) return;
      const newQty = ti.qty + delta;
      setTabOperating(true);
      try {
        if (newQty <= 0) {
          await removeItemFromTab(cartId, activeTab!.id);
        } else {
          await updateItemQtyInTab(cartId, activeTab!.id, newQty);
        }
        await reloadTabItems(activeTab!.id);
      } catch (e: any) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      } finally {
        setTabOperating(false);
      }
      return;
    }

    setCart((prev) =>
      prev
        .map((c) => {
          if (c.id !== cartId) return c;
          const newQty = c.qty + delta;
          if (newQty <= 0) return null;
          if (c.track_stock && c.product_id) {
            const prod = products.find((p) => p.id === c.product_id);
            if (prod && newQty > prod.qty_on_hand) {
              toast({ title: "Stock insuficiente", variant: "destructive" });
              return c;
            }
          }
          return { ...c, qty: newQty };
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const updatePrice = async (cartId: string, newPrice: number) => {
    if (newPrice <= 0) return;
    if (isTabMode) {
      setTabOperating(true);
      try {
        await (await import("@/lib/tab-store")).updateItemPriceInTab(cartId, activeTab!.id, newPrice);
        await reloadTabItems(activeTab!.id);
      } catch (e: any) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      } finally {
        setTabOperating(false);
      }
      return;
    }
    setCart((prev) =>
      prev.map((c) =>
        c.id === cartId ? { ...c, unit_price: newPrice, unit_price_base: newPrice } : c
      )
    );
  };

  const removeItem = async (cartId: string) => {
    if (isTabMode) {
      setTabOperating(true);
      try {
        await removeItemFromTab(cartId, activeTab!.id);
        await reloadTabItems(activeTab!.id);
      } catch (e: any) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      } finally {
        setTabOperating(false);
      }
      return;
    }
    setCart((prev) => prev.filter((c) => c.id !== cartId));
  };

  // Totals
  const subtotalLocal = displayItems
    .filter((c) => c.owner === "LOCAL")
    .reduce((s, c) => s + c.unit_price * c.qty, 0);
  const subtotalRestaurant = displayItems
    .filter((c) => c.owner === "RESTAURANTE")
    .reduce((s, c) => s + c.unit_price * c.qty, 0);
  const totalDeliveryFee = channel === "DELIVERY" ? deliveryFee : 0;
  const total = subtotalLocal + totalDeliveryFee + subtotalRestaurant;

  // === Tab operations ===
  const handleCreateTab = async (tabName: string) => {
    setCreatingTab(true);
    try {
      const tab = await createOpenTab(
        tabName,
        channel,
        priceTerm,
        user?.id,
        user?.user_metadata?.display_name || user?.email || ""
      );
      setActiveTab(tab);
      setTabItems([]);
      setNewTabOpen(false);
      toast({ title: `Cuenta "${tabName || `#${tab.id.slice(-6).toUpperCase()}`}" creada` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setCreatingTab(false);
    }
  };

  const handleSelectTab = async (tab: OpenTab) => {
    setActiveTab({ id: tab.id, tab_name: tab.tab_name });
    setPriceTerm(tab.price_term as string);
    await reloadTabItems(tab.id);
  };

  const handleCloseActiveTab = () => {
    setActiveTab(null);
    setTabItems([]);
  };

  const handleSendToKitchen = async () => {
    setTabOperating(true);
    try {
      let tabId: string;

      if (activeTab) {
        // Already in tab mode
        tabId = activeTab.id;
      } else {
        // Non-tab mode: auto-create a tab with current cart items
        const tab = await createOpenTab(
          "",
          channel,
          priceTerm,
          user?.id,
          user?.user_metadata?.display_name || user?.email || ""
        );
        // Insert all cart items into the new tab
        const costMap = getCostMap();
        for (const item of cart) {
          await addItemToTab(tab.id, item, costMap);
        }
        // Switch to tab mode
        setActiveTab(tab);
        setCart([]);
        tabId = tab.id;
        await reloadTabItems(tabId);
      }

      const count = await sendToKitchen(tabId);
      if (count > 0) {
        toast({ title: `Enviado a cocina (${count} ítem${count > 1 ? "s" : ""})` });
        await reloadTabItems(tabId);
      } else {
        toast({ title: "No hay ítems nuevos para enviar" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setTabOperating(false);
    }
  };

  // Checkout
  const handleConfirmSale = async (payments: PaymentLine[]) => {
    setSaving(true);
    try {
      if (isTabMode) {
        // Close tab
        await closeTab(activeTab!.id, payments, getSurchargePct(), user?.id);
        toast({ title: "¡Cuenta cerrada y cobrada!" });
        setActiveTab(null);
        setTabItems([]);
      } else {
        // Delivery immediate sale
        const costMap = getCostMap();
        await createSale(
          {
            channel,
            price_term: priceTerm,
            delivery_fee: totalDeliveryFee,
            cashier_id: user?.id,
            cashier_name_snapshot: user?.user_metadata?.display_name || user?.email || "",
            surcharge_pct: getSurchargePct(),
          },
          cart,
          payments,
          costMap
        );
        toast({ title: "¡Venta registrada!" });
        setCart([]);
      }
      setCheckoutOpen(false);
      qc.invalidateQueries({ queryKey: ["pos-products"] });
      qc.invalidateQueries({ queryKey: ["products-with-stock"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // When channel/term changes, update prices in cart for DELIVERY items
  const updateCartPrices = (newChannel: Channel, newTerm: string) => {
    setCart((prev) =>
      prev.map((c) => {
        if (c.owner === "LOCAL" && c.product_id) {
          const prod = products.find((p) => p.id === c.product_id);
          if (!prod) return c;
          const key = `${newChannel}_${newTerm}`;
          const newPrice = prod.prices[key];
          const basePrice = prod.prices[`${newChannel}_BASE`] ?? newPrice;
          if (!newPrice || newPrice <= 0) return c;
          return { ...c, unit_price: newPrice, unit_price_base: basePrice };
        }
        if (c.owner === "RESTAURANTE" && c.restaurant_item_id) {
          const item = restaurantItems.find((i) => i.id === c.restaurant_item_id);
          if (!item) return c;
          return { ...c, unit_price: applyFoodSurcharge(item.price, newTerm) };
        }
        return c;
      })
    );
  };

  const handleChannelChange = (ch: Channel) => {
    if (activeTab) {
      handleCloseActiveTab();
    }
    setChannel(ch);
    if (ch === "RESTAURANTE") setDeliveryFee(0);
    updateCartPrices(ch, priceTerm);
  };

  const handleTermChange = async (t: string) => {
    setPriceTerm(t);
    updateCartPrices(channel, t);

    // If there's an active tab, update the price term and recalculate item prices in DB
    if (isTabMode && activeTab) {
      setTabOperating(true);
      try {
        await updateTabPriceTerm(activeTab.id, t, products, restaurantItems, surchargeTiers);
        await reloadTabItems(activeTab.id);
      } catch (e: any) {
        toast({ title: "Error al cambiar término", description: e.message, variant: "destructive" });
      } finally {
        setTabOperating(false);
      }
    }
  };

  if (loadingP || loadingR) {
    return <div className="p-6 text-muted-foreground">Cargando datos...</div>;
  }

  const tabLabel = activeTab
    ? (activeTab.tab_name || `#${activeTab.id.slice(-6).toUpperCase()}`)
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* A) HEADER */}
      <div className="sticky top-0 z-10 bg-background border-b p-3 space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm font-medium mr-1">Canal:</span>
          {(["RESTAURANTE", "DELIVERY"] as Channel[]).map((ch) => (
            <Button
              key={ch}
              size="sm"
              variant={channel === ch ? "default" : "outline"}
              onClick={() => handleChannelChange(ch)}
              disabled={(cart.length > 0 || activeTab !== null) && channel !== ch}
            >
              {ch === "RESTAURANTE" ? "Restaurante" : "Delivery"}
            </Button>
          ))}
          {channel === "DELIVERY" && (
            <div className="flex items-center gap-1 ml-2">
              <span className="text-sm">Envío $</span>
              <Input
                type="number"
                className="w-20 h-8"
                value={deliveryFee || ""}
                onChange={(e) => setDeliveryFee(parseInt(e.target.value) || 0)}
              />
            </div>
          )}
          {channel === "RESTAURANTE" && (
            <div className="flex items-center gap-2 ml-auto">
              <Button size="sm" variant="outline" onClick={() => setTabsSheetOpen(true)}>
                <ClipboardList className="h-4 w-4 mr-1" /> Cuentas
              </Button>
              <Button size="sm" variant="outline" onClick={() => setNewTabOpen(true)} disabled={activeTab !== null}>
                <PlusCircle className="h-4 w-4 mr-1" /> Nueva cuenta
              </Button>
            </div>
          )}
        </div>

        {/* Active tab indicator */}
        {isTabMode && (
          <div className="flex items-center gap-2 bg-primary/10 rounded-md px-3 py-1.5">
            <Badge variant="default" className="text-xs">CUENTA ABIERTA</Badge>
            <span className="font-semibold text-sm">{tabLabel}</span>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 ml-auto" onClick={handleCloseActiveTab}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm font-medium mr-1">Precio:</span>
          {allTerms.map((t) => (
            <Button
              key={t}
              size="sm"
              variant={priceTerm === t ? "default" : "outline"}
              onClick={() => handleTermChange(t)}
              disabled={tabOperating}
            >
              {termLabels[t] ?? t}
            </Button>
          ))}
          {activeItemTab === "local" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOffersSheetOpen(true)}
              className="ml-auto"
            >
              <Tag className="h-4 w-4 mr-1" /> Ofertas
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {priceTerm !== "BASE" ? `Recargo ${termLabels[priceTerm] ?? priceTerm} aplicado a todos los ítems` : "QR/Transferencia/Tarjeta → MercadoPago"}
        </p>
      </div>

      {/* MAIN: Items + Cart */}
      <div className="flex flex-1 overflow-hidden">
        {/* B) ITEM SELECTOR */}
        <div className="flex-1 overflow-auto p-3">
          <Tabs defaultValue="local" onValueChange={setActiveItemTab}>
            <TabsList className="w-full">
              <TabsTrigger value="local" className="flex-1">Local</TabsTrigger>
              <TabsTrigger value="comida" className="flex-1">Comida</TabsTrigger>
            </TabsList>

            <TabsContent value="local" className="mt-2 space-y-2">
              {/* Type chips */}
              <div className="flex flex-wrap gap-1">
                {(["ALL", "BEBIDAS", "SNACKS", "CIGARRILLOS"] as const).map((t) => (
                  <Button
                    key={t}
                    size="sm"
                    variant={localTypeFilter === t ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => {
                      setLocalTypeFilter(t);
                      setLocalCatFilter("ALL");
                    }}
                  >
                    {t === "ALL" ? "Todos" : t === "BEBIDAS" ? "Bebidas" : t === "SNACKS" ? "Snacks" : "Cigarrillos"}
                  </Button>
                ))}
              </div>
              {/* Search + Category + Stock toggle */}
              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar producto..."
                    value={localSearch}
                    onChange={(e) => setLocalSearch(e.target.value)}
                    className="pl-8 h-9"
                  />
                </div>
                <Select value={localCatFilter} onValueChange={setLocalCatFilter}>
                  <SelectTrigger className="w-[130px] h-9">
                    <SelectValue placeholder="Categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todas</SelectItem>
                    {localCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="stock-only"
                  checked={localStockOnly}
                  onCheckedChange={setLocalStockOnly}
                />
                <Label htmlFor="stock-only" className="text-xs cursor-pointer">Solo con stock</Label>
              </div>
              <div className="space-y-1">
                {filteredProducts.map((p) => {
                  const priceKey = `${channel}_${priceTerm}`;
                  const price = p.prices[priceKey];
                  const noPrice = !price || price <= 0;
                  const noStock = p.track_stock && p.qty_on_hand <= 0;
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-2 rounded-md border hover:bg-muted/50 cursor-pointer"
                      onClick={() => !noPrice && !noStock && addLocalProduct(p)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {p.name}
                          {p.variant_label && (
                            <span className="text-muted-foreground ml-1">{p.variant_label}</span>
                          )}
                        </div>
                        <div className="flex gap-2 text-xs text-muted-foreground">
                          <span>{p.category}</span>
                          {p.track_stock && <span>Stock: {p.qty_on_hand}</span>}
                        </div>
                      </div>
                      <div className="text-right ml-2">
                        {noPrice ? (
                          <Badge variant="destructive" className="text-xs">
                            <AlertCircle className="h-3 w-3 mr-1" />Sin precio
                          </Badge>
                        ) : noStock ? (
                          <Badge variant="secondary" className="text-xs">Sin stock</Badge>
                        ) : (
                          <span className="font-semibold text-sm">${price.toLocaleString("es-AR")}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {filteredProducts.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No hay productos</p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="comida" className="mt-2 space-y-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar plato..."
                    value={foodSearch}
                    onChange={(e) => setFoodSearch(e.target.value)}
                    className="pl-8 h-9"
                  />
                </div>
                <Select value={foodCatFilter} onValueChange={setFoodCatFilter}>
                  <SelectTrigger className="w-[140px] h-9">
                    <SelectValue placeholder="Categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todas</SelectItem>
                    {categories.filter((c: any) => c.is_active).map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                {/* Restaurant Offers */}
                {filteredFoodOffers.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-1">🔥 Ofertas</p>
                    {filteredFoodOffers.map((item) => (
                      <div key={item.id} className="p-2 rounded-md border border-primary/20 bg-primary/5 space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0 flex items-center gap-1.5">
                            <Badge className="bg-amber-500/15 text-amber-700 border-amber-300 text-[10px] px-1.5 py-0 shrink-0">OFERTA</Badge>
                            <span className="font-medium text-sm truncate">{item.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">${applyFoodSurcharge(item.price, priceTerm).toLocaleString("es-AR")}</span>
                            <Button size="sm" variant="outline" className="h-7" onClick={() => addFoodItem(item)}>
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        {item.description && (
                          <p className="text-xs text-muted-foreground">{item.description}</p>
                        )}
                        <Input
                          placeholder="Nota (sin cebolla, etc.)"
                          value={foodNoteInput[item.id] || ""}
                          onChange={(e) => setFoodNoteInput((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          className="h-7 text-xs"
                        />
                      </div>
                    ))}
                    {filteredFood.length > 0 && <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">Platos</p>}
                  </>
                )}
                {filteredFood.map((item) => (
                  <div key={item.id} className="p-2 rounded-md border space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm">{item.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">{item.category_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">${applyFoodSurcharge(item.price, priceTerm).toLocaleString("es-AR")}</span>
                        {priceTerm !== "BASE" && (
                          <span className="text-xs text-muted-foreground line-through">${item.price.toLocaleString("es-AR")}</span>
                        )}
                        <Button size="sm" variant="outline" className="h-7" onClick={() => addFoodItem(item)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <Input
                      placeholder="Nota (sin cebolla, etc.)"
                      value={foodNoteInput[item.id] || ""}
                      onChange={(e) => setFoodNoteInput((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      className="h-7 text-xs"
                    />
                  </div>
                ))}
                {filteredFood.length === 0 && filteredFoodOffers.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No hay platos</p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* C) CART */}
        <div className="w-80 border-l flex flex-col bg-muted/30 max-md:hidden overflow-hidden">
          <div className="p-3 border-b font-semibold flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            {isTabMode ? `Cuenta: ${tabLabel}` : `Carrito (${displayItems.length})`}
          </div>
          <ScrollArea className="flex-1 min-h-0 p-3">
            {displayItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {isTabMode ? "Cuenta vacía — agregá ítems" : "Carrito vacío"}
              </p>
            ) : (
              <div className="space-y-2">
                {displayItems.map((c) => {
                  const sentFlag = (c as any)._sent_to_kitchen;
                  const isOffer = c.item_type === "OFFER";
                  const offerItems = (c as any)._offer_items;
                  return (
                    <div key={c.id} className="bg-background rounded-md p-2 border text-sm space-y-1">
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate flex items-center gap-1">
                            {isOffer && <Tag className="h-3 w-3 text-primary shrink-0" />}
                            {c.name}
                          </div>
                          {c.notes && (
                            <div className="text-xs text-muted-foreground italic">📝 {c.notes}</div>
                          )}
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeItem(c.id)} disabled={tabOperating}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      {isOffer && offerItems && (
                        <Collapsible>
                          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                            <ChevronDown className="h-3 w-3" /> Desglose
                          </CollapsibleTrigger>
                          <CollapsibleContent className="pl-4 mt-1 space-y-0.5">
                            {offerItems.map((oi: any) => (
                              <div key={oi.id} className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Package className="h-2.5 w-2.5" />
                                {oi.product_name}{oi.variant_label ? ` ${oi.variant_label}` : ""} ×{oi.qty}
                              </div>
                            ))}
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQty(c.id, -1)} disabled={tabOperating}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-6 text-center">{c.qty}</span>
                          <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQty(c.id, 1)} disabled={tabOperating}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="text-right">
                          <EditablePrice price={c.unit_price} itemId={c.id} isOffer={isOffer} disabled={tabOperating} onUpdate={updatePrice} />
                          <div className="font-medium">${(c.unit_price * c.qty).toLocaleString("es-AR")}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {isOffer ? (
                          <Badge className="text-xs bg-emerald-100 text-emerald-800 border-emerald-200">OFERTA</Badge>
                        ) : (
                          <Badge variant={c.owner === "LOCAL" ? "default" : "secondary"} className="text-xs">
                            {c.owner === "LOCAL" ? "Local" : "Restaurante"}
                          </Badge>
                        )}
                        {isTabMode && c.owner === "RESTAURANTE" && !isOffer && (
                          <Badge variant={sentFlag ? "outline" : "destructive"} className="text-xs">
                            {sentFlag ? "✓ Enviado" : "Sin enviar"}
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {/* Totals */}
          <div className="border-t p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Lo mío</span>
              <span>${(subtotalLocal + totalDeliveryFee).toLocaleString("es-AR")}</span>
            </div>
            {totalDeliveryFee > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground pl-2">
                <span>Envío</span>
                <span>${totalDeliveryFee.toLocaleString("es-AR")}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Restaurante</span>
              <span>${subtotalRestaurant.toLocaleString("es-AR")}</span>
            </div>
            <div className="flex justify-between font-bold text-base border-t pt-1">
              <span>Total</span>
              <span>${total.toLocaleString("es-AR")}</span>
            </div>

            {/* Send to kitchen button */}
            {hasUnsentKitchenItems && (
              <Button
                className="w-full"
                variant="outline"
                onClick={handleSendToKitchen}
                disabled={tabOperating}
              >
                <UtensilsCrossed className="h-4 w-4 mr-1" />
                Enviar a cocina
              </Button>
            )}

            <Button
              className="w-full mt-1"
              disabled={displayItems.length === 0 || tabOperating}
              onClick={() => setCheckoutOpen(true)}
            >
              {isTabMode ? `Cerrar y cobrar $${total.toLocaleString("es-AR")}` : `Cobrar $${total.toLocaleString("es-AR")}`}
            </Button>
          </div>
        </div>
      </div>

      {/* MOBILE CART FAB */}
      <div className="md:hidden fixed bottom-4 right-4 z-20">
        <Button
          size="lg"
          className="rounded-full shadow-lg h-14 px-5 text-base"
          onClick={() => setMobileCartOpen(true)}
        >
          <ShoppingCart className="h-5 w-5 mr-2" />
          {displayItems.length > 0
            ? `${displayItems.length} · $${total.toLocaleString("es-AR")}`
            : "Carrito"}
        </Button>
      </div>

      {/* MOBILE CART SHEET */}
      <Sheet open={mobileCartOpen} onOpenChange={setMobileCartOpen}>
        <SheetContent side="bottom" className="h-[85vh] flex flex-col p-0">
          <SheetHeader className="p-4 pb-2 border-b">
            <SheetTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              {isTabMode ? `Cuenta: ${tabLabel}` : `Carrito (${displayItems.length})`}
            </SheetTitle>
            <SheetDescription className="sr-only">Detalle del carrito</SheetDescription>
          </SheetHeader>
          <ScrollArea className="flex-1 min-h-0 p-4">
            {displayItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {isTabMode ? "Cuenta vacía — agregá ítems" : "Carrito vacío"}
              </p>
            ) : (
              <div className="space-y-2">
                {displayItems.map((c) => {
                  const sentFlag = (c as any)._sent_to_kitchen;
                  const isOffer = c.item_type === "OFFER";
                  const offerItems = (c as any)._offer_items;
                  return (
                    <div key={c.id} className="bg-background rounded-md p-3 border text-sm space-y-2">
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium flex items-center gap-1">
                            {isOffer && <Tag className="h-3.5 w-3.5 text-primary shrink-0" />}
                            {c.name}
                          </div>
                          {c.notes && (
                            <div className="text-xs text-muted-foreground italic">📝 {c.notes}</div>
                          )}
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeItem(c.id)} disabled={tabOperating}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {isOffer && offerItems && (
                        <Collapsible>
                          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                            <ChevronDown className="h-3 w-3" /> Desglose
                          </CollapsibleTrigger>
                          <CollapsibleContent className="pl-4 mt-1 space-y-0.5">
                            {offerItems.map((oi: any) => (
                              <div key={oi.id} className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Package className="h-2.5 w-2.5" />
                                {oi.product_name}{oi.variant_label ? ` ${oi.variant_label}` : ""} ×{oi.qty}
                              </div>
                            ))}
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => updateQty(c.id, -1)} disabled={tabOperating}>
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="w-8 text-center font-medium">{c.qty}</span>
                          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => updateQty(c.id, 1)} disabled={tabOperating}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="text-right">
                          <EditablePrice price={c.unit_price} itemId={c.id} isOffer={isOffer} disabled={tabOperating} onUpdate={updatePrice} />
                          <div className="font-semibold">${(c.unit_price * c.qty).toLocaleString("es-AR")}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {isOffer ? (
                          <Badge className="text-xs bg-emerald-100 text-emerald-800 border-emerald-200">OFERTA</Badge>
                        ) : (
                          <Badge variant={c.owner === "LOCAL" ? "default" : "secondary"} className="text-xs">
                            {c.owner === "LOCAL" ? "Local" : "Restaurante"}
                          </Badge>
                        )}
                        {isTabMode && c.owner === "RESTAURANTE" && !isOffer && (
                          <Badge variant={sentFlag ? "outline" : "destructive"} className="text-xs">
                            {sentFlag ? "✓ Enviado" : "Sin enviar"}
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {/* Mobile cart footer */}
          <div className="border-t p-4 space-y-2 bg-background">
            <div className="flex justify-between text-sm">
              <span>Lo mío</span>
              <span>${(subtotalLocal + totalDeliveryFee).toLocaleString("es-AR")}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Restaurante</span>
              <span>${subtotalRestaurant.toLocaleString("es-AR")}</span>
            </div>
            <div className="flex justify-between font-bold text-lg border-t pt-2">
              <span>Total</span>
              <span>${total.toLocaleString("es-AR")}</span>
            </div>
            {hasUnsentKitchenItems && (
              <Button
                className="w-full h-12 text-base"
                variant="outline"
                onClick={() => { setMobileCartOpen(false); handleSendToKitchen(); }}
                disabled={tabOperating}
              >
                <UtensilsCrossed className="h-5 w-5 mr-2" />
                Enviar a cocina
              </Button>
            )}
            <Button
              className="w-full h-12 text-base"
              disabled={displayItems.length === 0 || tabOperating}
              onClick={() => { setMobileCartOpen(false); setCheckoutOpen(true); }}
            >
              {isTabMode ? `Cerrar y cobrar $${total.toLocaleString("es-AR")}` : `Cobrar $${total.toLocaleString("es-AR")}`}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <CheckoutModal
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        total={total}
        subtotalLocal={subtotalLocal}
        subtotalRestaurant={subtotalRestaurant}
        deliveryFee={totalDeliveryFee}
        onConfirm={handleConfirmSale}
        loading={saving}
        initialPaymentMethod={priceTerm === "BASE" ? "EFECTIVO" : "TARJETA"}
        priceTerm={priceTerm}
        isClosingTab={isTabMode}
      />

      <OpenTabsSheet
        open={tabsSheetOpen}
        onOpenChange={setTabsSheetOpen}
        onSelectTab={handleSelectTab}
      />

      <NewTabDialog
        open={newTabOpen}
        onOpenChange={setNewTabOpen}
        onConfirm={handleCreateTab}
        loading={creatingTab}
      />

      <OffersSheet
        open={offersSheetOpen}
        onOpenChange={setOffersSheetOpen}
        onSelectOffer={addOffer}
        stockMap={stockMap}
        cartRequirements={cartStockRequirements}
      />
    </div>
  );
}
