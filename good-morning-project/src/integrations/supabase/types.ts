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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      licitacao_documentos_pncp: {
        Row: {
          created_at: string | null
          data_inclusao_pncp: string | null
          download_error: string | null
          file_size_bytes: number | null
          id: string
          is_analyzed: boolean | null
          is_downloaded: boolean | null
          licitacao_encontrada_id: string | null
          mime_type: string | null
          nome_arquivo_pncp: string | null
          storage_path: string | null
          tipo_documento: number | null
          tipo_documento_nome: string | null
          updated_at: string | null
          url_pncp: string | null
        }
        Insert: {
          created_at?: string | null
          data_inclusao_pncp?: string | null
          download_error?: string | null
          file_size_bytes?: number | null
          id?: string
          is_analyzed?: boolean | null
          is_downloaded?: boolean | null
          licitacao_encontrada_id?: string | null
          mime_type?: string | null
          nome_arquivo_pncp?: string | null
          storage_path?: string | null
          tipo_documento?: number | null
          tipo_documento_nome?: string | null
          updated_at?: string | null
          url_pncp?: string | null
        }
        Update: {
          created_at?: string | null
          data_inclusao_pncp?: string | null
          download_error?: string | null
          file_size_bytes?: number | null
          id?: string
          is_analyzed?: boolean | null
          is_downloaded?: boolean | null
          licitacao_encontrada_id?: string | null
          mime_type?: string | null
          nome_arquivo_pncp?: string | null
          storage_path?: string | null
          tipo_documento?: number | null
          tipo_documento_nome?: string | null
          updated_at?: string | null
          url_pncp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "licitacao_documentos_pncp_licitacao_encontrada_id_fkey"
            columns: ["licitacao_encontrada_id"]
            isOneToOne: false
            referencedRelation: "licitacoes_encontradas"
            referencedColumns: ["id"]
          },
        ]
      }
      licitacoes_encontradas: {
        Row: {
          ano_compra: number | null
          created_at: string | null
          data_abertura_proposta: string | null
          data_encerramento_proposta: string | null
          data_publicacao_pncp: string | null
          id: string
          is_viewed: boolean | null
          link_pncp: string | null
          modalidade_nome: string | null
          municipio_nome: string | null
          numero_compra: string | null
          numero_controle_pncp: string | null
          objeto_compra: string | null
          orgao_cnpj: string | null
          orgao_razao_social: string | null
          processo: string | null
          raw_data: Json | null
          search_config_id: string | null
          situacao: string | null
          uf_sigla: string | null
          unidade_nome: string | null
          valor_total_estimado: number | null
          vai_participar: boolean | null
          status_interno: string | null
          data_limite_interna: string | null
        }
        Insert: {
          ano_compra?: number | null
          created_at?: string | null
          data_abertura_proposta?: string | null
          data_encerramento_proposta?: string | null
          data_publicacao_pncp?: string | null
          id?: string
          is_viewed?: boolean | null
          link_pncp?: string | null
          modalidade_nome?: string | null
          municipio_nome?: string | null
          numero_compra?: string | null
          numero_controle_pncp?: string | null
          objeto_compra?: string | null
          orgao_cnpj?: string | null
          orgao_razao_social?: string | null
          processo?: string | null
          raw_data?: Json | null
          search_config_id?: string | null
          situacao?: string | null
          uf_sigla?: string | null
          unidade_nome?: string | null
          valor_total_estimado?: number | null
          vai_participar?: boolean | null
          status_interno?: string | null
          data_limite_interna?: string | null
        }
        Update: {
          ano_compra?: number | null
          created_at?: string | null
          data_abertura_proposta?: string | null
          data_encerramento_proposta?: string | null
          data_publicacao_pncp?: string | null
          id?: string
          is_viewed?: boolean | null
          link_pncp?: string | null
          modalidade_nome?: string | null
          municipio_nome?: string | null
          numero_compra?: string | null
          numero_controle_pncp?: string | null
          objeto_compra?: string | null
          orgao_cnpj?: string | null
          orgao_razao_social?: string | null
          processo?: string | null
          raw_data?: Json | null
          search_config_id?: string | null
          situacao?: string | null
          uf_sigla?: string | null
          unidade_nome?: string | null
          valor_total_estimado?: number | null
          vai_participar?: boolean | null
          status_interno?: string | null
          data_limite_interna?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "licitacoes_encontradas_search_config_id_fkey"
            columns: ["search_config_id"]
            isOneToOne: false
            referencedRelation: "search_configurations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          cnpj: string | null
          company_name: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          cnpj?: string | null
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          cnpj?: string | null
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      search_configurations: {
        Row: {
          categorias: number[] | null
          created_at: string | null
          frequency: string | null
          id: string
          is_active: boolean | null
          keywords: Json | null
          last_search_date: string | null
          modalidades: number[] | null
          municipalities: string[] | null
          name: string
          states: string[] | null
          updated_at: string | null
          user_id: string
          valor_maximo: number | null
          valor_minimo: number | null
        }
        Insert: {
          categorias?: number[] | null
          created_at?: string | null
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          keywords?: Json | null
          last_search_date?: string | null
          modalidades?: number[] | null
          municipalities?: string[] | null
          name: string
          states?: string[] | null
          updated_at?: string | null
          user_id: string
          valor_maximo?: number | null
          valor_minimo?: number | null
        }
        Update: {
          categorias?: number[] | null
          created_at?: string | null
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          keywords?: Json | null
          last_search_date?: string | null
          modalidades?: number[] | null
          municipalities?: string[] | null
          name?: string
          states?: string[] | null
          updated_at?: string | null
          user_id?: string
          valor_maximo?: number | null
          valor_minimo?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
