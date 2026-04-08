export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      cash_opening_balances: {
        Row: {
          amount: number
          created_at: string
          date: string
          fund: string
          id: string
          notes: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          date: string
          fund: string
          id?: string
          notes?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          date?: string
          fund?: string
          id?: string
          notes?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          created_by: string
          date: string
          description: string | null
          fund: string
          id: string
          is_pass_through: boolean
          payment_method: string
          source_stock_movement_id: string | null
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string
          created_by?: string
          date: string
          description?: string | null
          fund: string
          id?: string
          is_pass_through?: boolean
          payment_method: string
          source_stock_movement_id?: string | null
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string
          date?: string
          description?: string | null
          fund?: string
          id?: string
          is_pass_through?: boolean
          payment_method?: string
          source_stock_movement_id?: string | null
        }
        Relationships: []
      }
      fund_movements: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          date: string
          description: string | null
          fund: string
          id: string
          type: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string
          date: string
          description?: string | null
          fund: string
          id?: string
          type?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          date?: string
          description?: string | null
          fund?: string
          id?: string
          type?: string
        }
        Relationships: []
      }
      inventory_count_lines: {
        Row: {
          count_id: string
          counted_qty: number | null
          created_at: string
          diff_qty: number | null
          id: string
          product_id: string
          system_qty: number
        }
        Insert: {
          count_id: string
          counted_qty?: number | null
          created_at?: string
          diff_qty?: number | null
          id?: string
          product_id: string
          system_qty: number
        }
        Update: {
          count_id?: string
          counted_qty?: number | null
          created_at?: string
          diff_qty?: number | null
          id?: string
          product_id?: string
          system_qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_count_lines_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "inventory_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_counts: {
        Row: {
          adjusted_at: string | null
          closed_at: string | null
          created_at: string
          created_by: string
          end_date: string
          id: string
          notes: string | null
          start_date: string
          status: string
        }
        Insert: {
          adjusted_at?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string
          end_date: string
          id?: string
          notes?: string | null
          start_date: string
          status?: string
        }
        Update: {
          adjusted_at?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string
          end_date?: string
          id?: string
          notes?: string | null
          start_date?: string
          status?: string
        }
        Relationships: []
      }
      offer_items: {
        Row: {
          id: string
          offer_id: string
          product_id: string
          qty: number
          sort_order: number
        }
        Insert: {
          id?: string
          offer_id: string
          product_id: string
          qty: number
          sort_order?: number
        }
        Update: {
          id?: string
          offer_id?: string
          product_id?: string
          qty?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "offer_items_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          name: string
          offer_price: number
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          name: string
          offer_price: number
          type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          name?: string
          offer_price?: number
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      pos_payments: {
        Row: {
          amount: number
          commission_amount: number
          commission_pct: number
          fund: string
          id: string
          installments: number
          payment_method: string
          sale_id: string
        }
        Insert: {
          amount: number
          commission_amount?: number
          commission_pct?: number
          fund: string
          id?: string
          installments?: number
          payment_method: string
          sale_id: string
        }
        Update: {
          amount?: number
          commission_amount?: number
          commission_pct?: number
          fund?: string
          id?: string
          installments?: number
          payment_method?: string
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sale_item_components: {
        Row: {
          id: string
          line_cost: number
          name_snapshot: string
          product_id: string
          qty: number
          sale_item_id: string
          unit_cost_snapshot: number
        }
        Insert: {
          id?: string
          line_cost?: number
          name_snapshot: string
          product_id: string
          qty: number
          sale_item_id: string
          unit_cost_snapshot?: number
        }
        Update: {
          id?: string
          line_cost?: number
          name_snapshot?: string
          product_id?: string
          qty?: number
          sale_item_id?: string
          unit_cost_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_sale_item_components_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sale_item_components_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "pos_sale_items"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sale_items: {
        Row: {
          cost_snapshot: number
          delivered_at: string | null
          id: string
          item_type: string
          kitchen_batch_id: string | null
          kitchen_state: string
          line_total: number
          name_snapshot: string
          notes: string
          offer_id: string | null
          offer_name_snapshot: string | null
          offer_price_snapshot: number | null
          owner: string
          product_id: string | null
          qty: number
          restaurant_item_id: string | null
          sale_id: string
          sent_at: string | null
          sent_to_kitchen: boolean | null
          unit_price: number
          unit_price_base_snapshot: number
          variant_snapshot: string
        }
        Insert: {
          cost_snapshot?: number
          delivered_at?: string | null
          id?: string
          item_type: string
          kitchen_batch_id?: string | null
          kitchen_state?: string
          line_total: number
          name_snapshot: string
          notes?: string
          offer_id?: string | null
          offer_name_snapshot?: string | null
          offer_price_snapshot?: number | null
          owner: string
          product_id?: string | null
          qty: number
          restaurant_item_id?: string | null
          sale_id: string
          sent_at?: string | null
          sent_to_kitchen?: boolean | null
          unit_price: number
          unit_price_base_snapshot?: number
          variant_snapshot?: string
        }
        Update: {
          cost_snapshot?: number
          delivered_at?: string | null
          id?: string
          item_type?: string
          kitchen_batch_id?: string | null
          kitchen_state?: string
          line_total?: number
          name_snapshot?: string
          notes?: string
          offer_id?: string | null
          offer_name_snapshot?: string | null
          offer_price_snapshot?: number | null
          owner?: string
          product_id?: string | null
          qty?: number
          restaurant_item_id?: string | null
          sale_id?: string
          sent_at?: string | null
          sent_to_kitchen?: boolean | null
          unit_price?: number
          unit_price_base_snapshot?: number
          variant_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sale_items_restaurant_item_id_fkey"
            columns: ["restaurant_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sales: {
        Row: {
          cashier_id: string | null
          cashier_name_snapshot: string
          channel: string
          closed_at: string | null
          created_at: string
          created_by: string
          delivery_fee: number
          id: string
          kitchen_status: string
          opened_at: string | null
          price_term: string
          status: string
          subtotal_local: number
          subtotal_restaurant: number
          tab_name: string | null
          total: number
          updated_at: string | null
        }
        Insert: {
          cashier_id?: string | null
          cashier_name_snapshot?: string
          channel: string
          closed_at?: string | null
          created_at?: string
          created_by?: string
          delivery_fee?: number
          id?: string
          kitchen_status?: string
          opened_at?: string | null
          price_term: string
          status?: string
          subtotal_local?: number
          subtotal_restaurant?: number
          tab_name?: string | null
          total?: number
          updated_at?: string | null
        }
        Update: {
          cashier_id?: string | null
          cashier_name_snapshot?: string
          channel?: string
          closed_at?: string | null
          created_at?: string
          created_by?: string
          delivery_fee?: number
          id?: string
          kitchen_status?: string
          opened_at?: string | null
          price_term?: string
          status?: string
          subtotal_local?: number
          subtotal_restaurant?: number
          tab_name?: string | null
          total?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      price_settings: {
        Row: {
          credit_1_pct: number
          credit_3_pct: number
          debit_pct: number
          id: number
          updated_at: string
        }
        Insert: {
          credit_1_pct?: number
          credit_3_pct?: number
          debit_pct?: number
          id?: number
          updated_at?: string
        }
        Update: {
          credit_1_pct?: number
          credit_3_pct?: number
          debit_pct?: number
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      price_terms: {
        Row: {
          code: string
          created_at: string
          default_installments: number | null
          fund: string
          id: string
          is_active: boolean
          label: string
          sort_order: number
          surcharge_pct: number
        }
        Insert: {
          code: string
          created_at?: string
          default_installments?: number | null
          fund?: string
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          surcharge_pct?: number
        }
        Update: {
          code?: string
          created_at?: string
          default_installments?: number | null
          fund?: string
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          surcharge_pct?: number
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          type_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          type_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "product_types"
            referencedColumns: ["id"]
          },
        ]
      }
      product_prices: {
        Row: {
          channel: string
          id: string
          price: number
          product_id: string
          term: string
        }
        Insert: {
          channel: string
          id?: string
          price?: number
          product_id: string
          term: string
        }
        Update: {
          channel?: string
          id?: string
          price?: number
          product_id?: string
          term?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_types: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sku_prefix: string
          sort_order: number
          units: string[]
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sku_prefix?: string
          sort_order?: number
          units?: string[]
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sku_prefix?: string
          sort_order?: number
          units?: string[]
        }
        Relationships: []
      }
      products: {
        Row: {
          category: string
          cost_price: number
          created_at: string
          id: string
          is_active: boolean
          min_stock: number
          name: string
          sku: string
          track_stock: boolean
          type: string
          variant_label: string
        }
        Insert: {
          category?: string
          cost_price?: number
          created_at?: string
          id?: string
          is_active?: boolean
          min_stock?: number
          name: string
          sku?: string
          track_stock?: boolean
          type: string
          variant_label?: string
        }
        Update: {
          category?: string
          cost_price?: number
          created_at?: string
          id?: string
          is_active?: boolean
          min_stock?: number
          name?: string
          sku?: string
          track_stock?: boolean
          type?: string
          variant_label?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      restaurant_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      restaurant_items: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_offer: boolean
          name: string
          price: number
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_offer?: boolean
          name: string
          price?: number
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_offer?: boolean
          name?: string
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "restaurant_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_balances: {
        Row: {
          product_id: string
          qty_on_hand: number
        }
        Insert: {
          product_id: string
          qty_on_hand?: number
        }
        Update: {
          product_id?: string
          qty_on_hand?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_balances_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string
          id: string
          product_id: string
          qty: number
          reason: string
          sale_id: string | null
          supplier_id: string | null
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          product_id: string
          qty: number
          reason?: string
          sale_id?: string | null
          supplier_id?: string | null
          type: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          product_id?: string
          qty?: number
          reason?: string
          sale_id?: string | null
          supplier_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_purchase_items: {
        Row: {
          created_at: string
          id: string
          line_total: number
          product_id: string
          purchase_id: string
          qty: number
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_total?: number
          product_id: string
          purchase_id: string
          qty?: number
          unit_cost?: number
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          product_id?: string
          purchase_id?: string
          qty?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "stock_purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_purchases: {
        Row: {
          created_at: string
          created_by: string
          id: string
          notes: string | null
          payment_fund: string
          payment_method: string
          purchase_date: string
          supplier_id: string | null
          supplier_name_snapshot: string
          total_amount: number
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          payment_fund?: string
          payment_method?: string
          purchase_date?: string
          supplier_id?: string | null
          supplier_name_snapshot?: string
          total_amount?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          payment_fund?: string
          payment_method?: string
          purchase_date?: string
          supplier_id?: string | null
          supplier_name_snapshot?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          created_at: string
          id: string
          lead_time_days: number | null
          name: string
          phone: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_time_days?: number | null
          name: string
          phone?: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_time_days?: number | null
          name?: string
          phone?: string
        }
        Relationships: []
      }
      surcharge_tiers: {
        Row: {
          created_at: string
          id: string
          name: string
          percentage: number
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          percentage?: number
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          percentage?: number
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      variant_sets: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      variant_values: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          set_id: string
          sort_order: number
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          set_id: string
          sort_order?: number
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          set_id?: string
          sort_order?: number
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_values_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "variant_sets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_finance_movements: {
        Row: {
          amount: number | null
          amount_local: number | null
          amount_restaurant: number | null
          channel: string | null
          description: string | null
          direction: string | null
          fund: string | null
          is_pass_through: boolean | null
          movement_id: string | null
          movement_type: string | null
          occurred_at: string | null
          payment_method: string | null
          reference_label: string | null
          source: string | null
          source_id: string | null
          user_id: string | null
          user_name: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "cajero" | "cocina"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "cajero", "cocina"],
    },
  },
} as const
