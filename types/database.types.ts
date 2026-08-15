export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      catalog_foods: {
        Row: {
          base_amount: number
          base_unit: string
          brand_name: string | null
          country_code: string | null
          created_at: string
          data_completeness: number | null
          description: string | null
          food_type: string
          id: string
          is_active: boolean
          metadata: Json
          name: string
          search_document: unknown
          source_food_id: string | null
          source_id: string
          updated_at: string
          verification_level: string
        }
        Insert: {
          base_amount?: number
          base_unit?: string
          brand_name?: string | null
          country_code?: string | null
          created_at?: string
          data_completeness?: number | null
          description?: string | null
          food_type: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          search_document?: unknown
          source_food_id?: string | null
          source_id: string
          updated_at?: string
          verification_level?: string
        }
        Update: {
          base_amount?: number
          base_unit?: string
          brand_name?: string | null
          country_code?: string | null
          created_at?: string
          data_completeness?: number | null
          description?: string | null
          food_type?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          search_document?: unknown
          source_food_id?: string | null
          source_id?: string
          updated_at?: string
          verification_level?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_foods_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "food_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      food_aliases: {
        Row: {
          alias: string
          alias_type: string | null
          created_at: string
          food_id: string
          id: string
          language_code: string | null
          search_document: unknown
          updated_at: string
        }
        Insert: {
          alias: string
          alias_type?: string | null
          created_at?: string
          food_id: string
          id?: string
          language_code?: string | null
          search_document?: unknown
          updated_at?: string
        }
        Update: {
          alias?: string
          alias_type?: string | null
          created_at?: string
          food_id?: string
          id?: string
          language_code?: string | null
          search_document?: unknown
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_aliases_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "catalog_foods"
            referencedColumns: ["id"]
          },
        ]
      }
      food_barcodes: {
        Row: {
          barcode: string
          country_code: string | null
          created_at: string
          food_id: string
          id: string
          is_primary: boolean
          updated_at: string
        }
        Insert: {
          barcode: string
          country_code?: string | null
          created_at?: string
          food_id: string
          id?: string
          is_primary?: boolean
          updated_at?: string
        }
        Update: {
          barcode?: string
          country_code?: string | null
          created_at?: string
          food_id?: string
          id?: string
          is_primary?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_barcodes_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "catalog_foods"
            referencedColumns: ["id"]
          },
        ]
      }
      food_favorites: {
        Row: {
          catalog_food_id: string
          catalog_serving_id: string | null
          created_at: string
          display_name: string | null
          effective_grams: number | null
          id: string
          serving_label: string
          serving_quantity: number
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          catalog_food_id: string
          catalog_serving_id?: string | null
          created_at?: string
          display_name?: string | null
          effective_grams?: number | null
          id?: string
          serving_label: string
          serving_quantity?: number
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          catalog_food_id?: string
          catalog_serving_id?: string | null
          created_at?: string
          display_name?: string | null
          effective_grams?: number | null
          id?: string
          serving_label?: string
          serving_quantity?: number
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_favorites_catalog_food_id_fkey"
            columns: ["catalog_food_id"]
            isOneToOne: false
            referencedRelation: "catalog_foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_favorites_catalog_serving_id_fkey"
            columns: ["catalog_serving_id"]
            isOneToOne: false
            referencedRelation: "food_servings"
            referencedColumns: ["id"]
          },
        ]
      }
      food_logs: {
        Row: {
          calories: number
          calories_per_serving: number
          carbs_g: number
          carbs_per_serving_g: number
          catalog_food_id: string | null
          catalog_serving_id: string | null
          effective_grams: number | null
          fat_g: number
          fat_per_serving_g: number
          fiber_g: number
          fiber_per_serving_g: number
          food_brand: string | null
          food_id: string | null
          food_name: string | null
          food_source: string
          id: string
          logged_at: string
          logged_from: string
          meal: Database["public"]["Enums"]["meal_type"]
          note: string | null
          nutrients_snapshot: Json | null
          protein_g: number
          protein_per_serving_g: number
          recipe_id: string | null
          serving_label: string | null
          serving_quantity: number
          servings: number
          sodium_mg_per_serving: number
          user_food_id: string | null
          user_food_serving_id: string | null
          user_id: string
        }
        Insert: {
          calories: number
          calories_per_serving?: number
          carbs_g?: number
          carbs_per_serving_g?: number
          catalog_food_id?: string | null
          catalog_serving_id?: string | null
          effective_grams?: number | null
          fat_g?: number
          fat_per_serving_g?: number
          fiber_g?: number
          fiber_per_serving_g?: number
          food_brand?: string | null
          food_id?: string | null
          food_name?: string | null
          food_source?: string
          id?: string
          logged_at?: string
          logged_from?: string
          meal: Database["public"]["Enums"]["meal_type"]
          note?: string | null
          nutrients_snapshot?: Json | null
          protein_g?: number
          protein_per_serving_g?: number
          recipe_id?: string | null
          serving_label?: string | null
          serving_quantity?: number
          servings?: number
          sodium_mg_per_serving?: number
          user_food_id?: string | null
          user_food_serving_id?: string | null
          user_id: string
        }
        Update: {
          calories?: number
          calories_per_serving?: number
          carbs_g?: number
          carbs_per_serving_g?: number
          catalog_food_id?: string | null
          catalog_serving_id?: string | null
          effective_grams?: number | null
          fat_g?: number
          fat_per_serving_g?: number
          fiber_g?: number
          fiber_per_serving_g?: number
          food_brand?: string | null
          food_id?: string | null
          food_name?: string | null
          food_source?: string
          id?: string
          logged_at?: string
          logged_from?: string
          meal?: Database["public"]["Enums"]["meal_type"]
          note?: string | null
          nutrients_snapshot?: Json | null
          protein_g?: number
          protein_per_serving_g?: number
          recipe_id?: string | null
          serving_label?: string | null
          serving_quantity?: number
          servings?: number
          sodium_mg_per_serving?: number
          user_food_id?: string | null
          user_food_serving_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_logs_catalog_food_id_fkey"
            columns: ["catalog_food_id"]
            isOneToOne: false
            referencedRelation: "catalog_foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_logs_catalog_serving_id_fkey"
            columns: ["catalog_serving_id"]
            isOneToOne: false
            referencedRelation: "food_servings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_logs_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_logs_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_logs_user_food_id_fkey"
            columns: ["user_food_id"]
            isOneToOne: false
            referencedRelation: "user_foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_logs_user_food_serving_id_fkey"
            columns: ["user_food_serving_id"]
            isOneToOne: false
            referencedRelation: "user_food_servings"
            referencedColumns: ["id"]
          },
        ]
      }
      food_nutrients: {
        Row: {
          amount: number
          created_at: string
          data_origin: string | null
          food_id: string
          nutrient_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          data_origin?: string | null
          food_id: string
          nutrient_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          data_origin?: string | null
          food_id?: string
          nutrient_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_nutrients_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "catalog_foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_nutrients_nutrient_id_fkey"
            columns: ["nutrient_id"]
            isOneToOne: false
            referencedRelation: "nutrients"
            referencedColumns: ["id"]
          },
        ]
      }
      food_servings: {
        Row: {
          created_at: string
          food_id: string
          gram_weight: number | null
          household_unit: string | null
          id: string
          is_default: boolean
          milliliter_volume: number | null
          nutrient_values: Json | null
          quantity: number
          serving_name: string
          source_serving_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          food_id: string
          gram_weight?: number | null
          household_unit?: string | null
          id?: string
          is_default?: boolean
          milliliter_volume?: number | null
          nutrient_values?: Json | null
          quantity?: number
          serving_name: string
          source_serving_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          food_id?: string
          gram_weight?: number | null
          household_unit?: string | null
          id?: string
          is_default?: boolean
          milliliter_volume?: number | null
          nutrient_values?: Json | null
          quantity?: number
          serving_name?: string
          source_serving_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_servings_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "catalog_foods"
            referencedColumns: ["id"]
          },
        ]
      }
      food_sources: {
        Row: {
          attribution_text: string | null
          bulk_import_status: string | null
          code: string
          created_at: string
          data_type: string | null
          description: string | null
          id: string
          is_active: boolean
          license_name: string | null
          license_url: string | null
          name: string
          reuse_notes: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          attribution_text?: string | null
          bulk_import_status?: string | null
          code: string
          created_at?: string
          data_type?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          license_name?: string | null
          license_url?: string | null
          name: string
          reuse_notes?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          attribution_text?: string | null
          bulk_import_status?: string | null
          code?: string
          created_at?: string
          data_type?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          license_name?: string | null
          license_url?: string | null
          name?: string
          reuse_notes?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      foods: {
        Row: {
          brand: string | null
          calories: number
          carbs_g: number
          created_at: string
          created_by: string | null
          default_servings: number
          fat_g: number
          featured_in_barcode_preview: boolean
          fiber_g: number
          id: string
          is_public: boolean
          keywords: string[]
          name: string
          protein_g: number
          serving_grams: number | null
          serving_label: string
          slug: string | null
          sodium_mg: number
          source: string
          suggested_meal_ids: string[]
        }
        Insert: {
          brand?: string | null
          calories: number
          carbs_g?: number
          created_at?: string
          created_by?: string | null
          default_servings?: number
          fat_g?: number
          featured_in_barcode_preview?: boolean
          fiber_g?: number
          id?: string
          is_public?: boolean
          keywords?: string[]
          name: string
          protein_g?: number
          serving_grams?: number | null
          serving_label: string
          slug?: string | null
          sodium_mg?: number
          source?: string
          suggested_meal_ids?: string[]
        }
        Update: {
          brand?: string | null
          calories?: number
          carbs_g?: number
          created_at?: string
          created_by?: string | null
          default_servings?: number
          fat_g?: number
          featured_in_barcode_preview?: boolean
          fiber_g?: number
          id?: string
          is_public?: boolean
          keywords?: string[]
          name?: string
          protein_g?: number
          serving_grams?: number | null
          serving_label?: string
          slug?: string | null
          sodium_mg?: number
          source?: string
          suggested_meal_ids?: string[]
        }
        Relationships: []
      }
      nutrients: {
        Row: {
          category: string
          code: string
          created_at: string
          display_order: number | null
          id: string
          is_core: boolean
          name: string
          unit: string
          updated_at: string
        }
        Insert: {
          category: string
          code: string
          created_at?: string
          display_order?: number | null
          id?: string
          is_core?: boolean
          name: string
          unit: string
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          display_order?: number | null
          id?: string
          is_core?: boolean
          name?: string
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      nutrition_goals: {
        Row: {
          calories_target: number
          carbs_target_g: number
          created_at: string
          exercise_calories: number
          fat_target_g: number
          goal_date: string
          hydration_consumed_liters: number
          hydration_target_ml: number
          id: string
          protein_target_g: number
          user_id: string
        }
        Insert: {
          calories_target: number
          carbs_target_g: number
          created_at?: string
          exercise_calories?: number
          fat_target_g: number
          goal_date: string
          hydration_consumed_liters?: number
          hydration_target_ml?: number
          id?: string
          protein_target_g: number
          user_id: string
        }
        Update: {
          calories_target?: number
          carbs_target_g?: number
          created_at?: string
          exercise_calories?: number
          fat_target_g?: number
          goal_date?: string
          hydration_consumed_liters?: number
          hydration_target_ml?: number
          id?: string
          protein_target_g?: number
          user_id?: string
        }
        Relationships: []
      }
      recipe_ingredients: {
        Row: {
          catalog_food_id: string | null
          catalog_serving_id: string | null
          created_at: string
          effective_grams: number | null
          id: string
          position: number
          quantity: number
          recipe_id: string
          serving_label: string
          updated_at: string
          user_food_id: string | null
          user_food_serving_id: string | null
        }
        Insert: {
          catalog_food_id?: string | null
          catalog_serving_id?: string | null
          created_at?: string
          effective_grams?: number | null
          id?: string
          position?: number
          quantity: number
          recipe_id: string
          serving_label: string
          updated_at?: string
          user_food_id?: string | null
          user_food_serving_id?: string | null
        }
        Update: {
          catalog_food_id?: string | null
          catalog_serving_id?: string | null
          created_at?: string
          effective_grams?: number | null
          id?: string
          position?: number
          quantity?: number
          recipe_id?: string
          serving_label?: string
          updated_at?: string
          user_food_id?: string | null
          user_food_serving_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_catalog_food_id_fkey"
            columns: ["catalog_food_id"]
            isOneToOne: false
            referencedRelation: "catalog_foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_catalog_serving_id_fkey"
            columns: ["catalog_serving_id"]
            isOneToOne: false
            referencedRelation: "food_servings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_user_food_id_fkey"
            columns: ["user_food_id"]
            isOneToOne: false
            referencedRelation: "user_foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_user_food_serving_id_fkey"
            columns: ["user_food_serving_id"]
            isOneToOne: false
            referencedRelation: "user_food_servings"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          created_at: string
          description: string | null
          final_weight_g: number
          id: string
          is_active: boolean
          name: string
          serving_count: number | null
          total_nutrients: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          final_weight_g: number
          id?: string
          is_active?: boolean
          name: string
          serving_count?: number | null
          total_nutrients?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          final_weight_g?: number
          id?: string
          is_active?: boolean
          name?: string
          serving_count?: number | null
          total_nutrients?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_food_nutrients: {
        Row: {
          amount: number
          created_at: string
          nutrient_id: string
          updated_at: string
          user_food_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          nutrient_id: string
          updated_at?: string
          user_food_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          nutrient_id?: string
          updated_at?: string
          user_food_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_food_nutrients_nutrient_id_fkey"
            columns: ["nutrient_id"]
            isOneToOne: false
            referencedRelation: "nutrients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_food_nutrients_user_food_id_fkey"
            columns: ["user_food_id"]
            isOneToOne: false
            referencedRelation: "user_foods"
            referencedColumns: ["id"]
          },
        ]
      }
      user_food_servings: {
        Row: {
          created_at: string
          gram_weight: number | null
          household_unit: string | null
          id: string
          is_default: boolean
          milliliter_volume: number | null
          quantity: number
          serving_name: string
          sort_order: number
          updated_at: string
          user_food_id: string
        }
        Insert: {
          created_at?: string
          gram_weight?: number | null
          household_unit?: string | null
          id?: string
          is_default?: boolean
          milliliter_volume?: number | null
          quantity: number
          serving_name: string
          sort_order?: number
          updated_at?: string
          user_food_id: string
        }
        Update: {
          created_at?: string
          gram_weight?: number | null
          household_unit?: string | null
          id?: string
          is_default?: boolean
          milliliter_volume?: number | null
          quantity?: number
          serving_name?: string
          sort_order?: number
          updated_at?: string
          user_food_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_food_servings_user_food_id_fkey"
            columns: ["user_food_id"]
            isOneToOne: false
            referencedRelation: "user_foods"
            referencedColumns: ["id"]
          },
        ]
      }
      user_foods: {
        Row: {
          base_amount: number
          base_unit: string
          brand_name: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          base_amount: number
          base_unit: string
          brand_name?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          base_amount?: number
          base_unit?: string
          brand_name?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      archive_recipe: { Args: { target_recipe_id: string }; Returns: undefined }
      archive_user_food: {
        Args: { target_food_id: string }
        Returns: undefined
      }
      barcode_gtin_check_digit: { Args: { body: string }; Returns: number }
      convert_nutrient_unit: {
        Args: { amount: number; source_unit: string; target_unit: string }
        Returns: number
      }
      food_log_entry_type: {
        Args: {
          legacy_food_id: string
          master_catalog_food_id: string
          personal_food_id: string
          recipe_reference_id: string
        }
        Returns: string
      }
      food_log_reference_key: {
        Args: {
          legacy_food_id: string
          master_catalog_food_id: string
          personal_food_id: string
          recipe_reference_id: string
        }
        Returns: string
      }
      food_source_priority: { Args: { source_code: string }; Returns: number }
      get_food_go_tos: {
        Args: {
          meal_context: Database["public"]["Enums"]["meal_type"]
          result_limit?: number
        }
        Returns: {
          calories_per_serving: number
          carbs_per_serving_g: number
          catalog_food_id: string
          catalog_serving_id: string
          effective_grams: number
          entry_type: string
          fat_per_serving_g: number
          fiber_per_serving_g: number
          food_brand: string
          food_id: string
          food_name: string
          food_source: string
          go_to_score: number
          last_logged_at: string
          log_count: number
          meal_match_count: number
          protein_per_serving_g: number
          recipe_id: string
          reference_key: string
          serving_label: string
          serving_quantity: number
          sodium_mg_per_serving: number
          user_food_id: string
          user_food_serving_id: string
        }[]
      }
      get_recent_foods: {
        Args: { result_limit?: number }
        Returns: {
          calories_per_serving: number
          carbs_per_serving_g: number
          catalog_food_id: string
          catalog_serving_id: string
          effective_grams: number
          entry_type: string
          fat_per_serving_g: number
          fiber_per_serving_g: number
          food_brand: string
          food_id: string
          food_name: string
          food_source: string
          last_logged_at: string
          log_count: number
          protein_per_serving_g: number
          recipe_id: string
          reference_key: string
          serving_label: string
          serving_quantity: number
          sodium_mg_per_serving: number
          user_food_id: string
          user_food_serving_id: string
        }[]
      }
      import_open_food_facts_product: {
        Args: {
          normalized_barcode: string
          original_barcode?: string
          product: Json
          requested_country_code?: string
        }
        Returns: {
          brand_name: string
          food_id: string
          message: string
          product_name: string
          status: string
        }[]
      }
      is_valid_gtin: { Args: { barcode: string }; Returns: boolean }
      jsonb_numeric_or_null: { Args: { value: Json }; Returns: number }
      lookup_food_barcode: {
        Args: {
          input_normalized_barcode: string
          raw_barcode: string
          requested_country_code?: string
        }
        Returns: {
          brand_name: string
          food_id: string
          lookup_path: string
          message: string
          normalized_barcode: string
          product_name: string
          source_code: string
          status: string
        }[]
      }
      normalize_country_code: {
        Args: { input_country_code: string }
        Returns: string
      }
      normalize_food_search_text: { Args: { input: string }; Returns: string }
      off_nutrient_value_for_suffix: {
        Args: {
          alt_nutrient_key?: string
          alt_unit_key?: string
          nutrient_key: string
          nutriments: Json
          nutrition_data_per: string
          suffix: string
          target_unit: string
          unit_key: string
        }
        Returns: number
      }
      off_nutriment_value: {
        Args: {
          nutriments: Json
          target_unit: string
          unit_keys: string[]
          value_keys: string[]
        }
        Returns: number
      }
      parse_packaged_measurement: {
        Args: { measurement_text: string }
        Returns: {
          gram_weight: number
          household_unit: string
          milliliter_volume: number
          quantity: number
        }[]
      }
      resolve_catalog_food_barcode: {
        Args: { normalized_barcode: string; requested_country_code?: string }
        Returns: {
          barcode: string
          brand_name: string
          country_code: string
          data_completeness: number
          food_id: string
          food_name: string
          food_type: string
          resolver_reason: string
          source_code: string
          source_food_id: string
          updated_at: string
          verification_level: string
        }[]
      }
      save_recipe: {
        Args: {
          description?: string
          final_weight_g?: number
          ingredients?: Json
          recipe_id?: string
          recipe_name?: string
          serving_count?: number
          total_nutrients?: Json
        }
        Returns: string
      }
      save_user_food: {
        Args: {
          base_amount?: number
          base_unit?: string
          brand_name?: string
          description?: string
          food_id?: string
          food_name?: string
          nutrient_values?: Json
          servings?: Json
        }
        Returns: string
      }
      search_catalog_foods: {
        Args: {
          filter_country_code?: string
          filter_food_type?: string
          filter_source_code?: string
          preferred_market_country_code?: string
          result_limit?: number
          search_query: string
        }
        Returns: {
          brand_name: string
          country_code: string
          data_completeness: number
          description: string
          food_id: string
          food_type: string
          matched_alias: string
          name: string
          relevance_score: number
          source_code: string
          source_food_id: string
          verification_level: string
        }[]
      }
      search_food_history: {
        Args: { result_limit?: number; search_query: string }
        Returns: {
          calories_per_serving: number
          carbs_per_serving_g: number
          catalog_food_id: string
          catalog_serving_id: string
          effective_grams: number
          entry_type: string
          fat_per_serving_g: number
          fiber_per_serving_g: number
          food_brand: string
          food_id: string
          food_name: string
          food_source: string
          history_score: number
          last_logged_at: string
          log_count: number
          protein_per_serving_g: number
          recipe_id: string
          reference_key: string
          serving_label: string
          serving_quantity: number
          sodium_mg_per_serving: number
          user_food_id: string
          user_food_serving_id: string
        }[]
      }
    }
    Enums: {
      meal_type: "Breakfast" | "Lunch" | "Dinner" | "Snack"
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
      meal_type: ["Breakfast", "Lunch", "Dinner", "Snack"],
    },
  },
} as const

