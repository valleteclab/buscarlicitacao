-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create profiles table for user information
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  company_name TEXT,
  cnpj TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Create search_configurations table
CREATE TABLE IF NOT EXISTS public.search_configurations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  keywords JSONB DEFAULT '[]'::jsonb,
  states TEXT[] DEFAULT ARRAY[]::TEXT[],
  municipalities TEXT[] DEFAULT ARRAY[]::TEXT[],
  modalidades INT[] DEFAULT ARRAY[]::INT[],
  valor_minimo DECIMAL,
  valor_maximo DECIMAL,
  categorias INT[] DEFAULT ARRAY[]::INT[],
  is_active BOOLEAN DEFAULT true,
  frequency TEXT DEFAULT 'daily',
  last_search_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on search_configurations
ALTER TABLE public.search_configurations ENABLE ROW LEVEL SECURITY;

-- Search configurations policies
CREATE POLICY "Users can view their own search configurations"
  ON public.search_configurations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own search configurations"
  ON public.search_configurations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own search configurations"
  ON public.search_configurations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own search configurations"
  ON public.search_configurations FOR DELETE
  USING (auth.uid() = user_id);

-- Create licitacoes_encontradas table
CREATE TABLE IF NOT EXISTS public.licitacoes_encontradas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  search_config_id UUID REFERENCES public.search_configurations(id) ON DELETE CASCADE,
  numero_controle_pncp TEXT UNIQUE,
  numero_compra TEXT,
  ano_compra INT,
  processo TEXT,
  objeto_compra TEXT,
  modalidade_nome TEXT,
  situacao TEXT,
  valor_total_estimado DECIMAL,
  data_abertura_proposta TIMESTAMPTZ,
  data_encerramento_proposta TIMESTAMPTZ,
  data_publicacao_pncp DATE,
  orgao_cnpj TEXT,
  orgao_razao_social TEXT,
  unidade_nome TEXT,
  municipio_nome TEXT,
  uf_sigla TEXT,
  link_pncp TEXT,
  raw_data JSONB,
  is_viewed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on licitacoes_encontradas
ALTER TABLE public.licitacoes_encontradas ENABLE ROW LEVEL SECURITY;

-- Licitacoes encontradas policies
CREATE POLICY "Users can view licitacoes from their search configs"
  ON public.licitacoes_encontradas FOR SELECT
  USING (
    search_config_id IN (
      SELECT id FROM public.search_configurations WHERE user_id = auth.uid()
    )
  );

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_licitacoes_encontradas_search_config 
  ON public.licitacoes_encontradas(search_config_id);

CREATE INDEX IF NOT EXISTS idx_licitacoes_encontradas_data_publicacao 
  ON public.licitacoes_encontradas(data_publicacao_pncp);

-- Create licitacao_documentos_pncp table
CREATE TABLE IF NOT EXISTS public.licitacao_documentos_pncp (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  licitacao_encontrada_id UUID REFERENCES public.licitacoes_encontradas(id) ON DELETE CASCADE,
  tipo_documento INT,
  tipo_documento_nome TEXT,
  nome_arquivo_pncp TEXT,
  data_inclusao_pncp TIMESTAMPTZ,
  url_pncp TEXT,
  storage_path TEXT,
  file_size_bytes BIGINT,
  mime_type TEXT,
  is_downloaded BOOLEAN DEFAULT false,
  download_error TEXT,
  is_analyzed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on licitacao_documentos_pncp
ALTER TABLE public.licitacao_documentos_pncp ENABLE ROW LEVEL SECURITY;

-- Documentos policies
CREATE POLICY "Users can view documents from their licitacoes"
  ON public.licitacao_documentos_pncp FOR SELECT
  USING (
    licitacao_encontrada_id IN (
      SELECT id FROM public.licitacoes_encontradas WHERE search_config_id IN (
        SELECT id FROM public.search_configurations WHERE user_id = auth.uid()
      )
    )
  );

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_licitacao_docs_licitacao 
  ON public.licitacao_documentos_pncp(licitacao_encontrada_id);

CREATE INDEX IF NOT EXISTS idx_licitacao_docs_tipo 
  ON public.licitacao_documentos_pncp(tipo_documento);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_search_configurations_updated_at
  BEFORE UPDATE ON public.search_configurations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_licitacao_documentos_updated_at
  BEFORE UPDATE ON public.licitacao_documentos_pncp
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();