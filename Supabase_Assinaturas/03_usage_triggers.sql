-- Função PL/pgSQL para impedir current_usage de ter valores negativos
CREATE OR REPLACE FUNCTION public.prevent_negative_usage()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.current_usage < 0 THEN
        RAISE EXCEPTION 'A métrica current_usage não pode ser um atributo negativo. Valor recebido: %', NEW.current_usage;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger associada à tabela usage_counters para ser executada antes de INSERT ou UPDATE
CREATE TRIGGER ensure_non_negative_usage
BEFORE INSERT OR UPDATE ON public.usage_counters
FOR EACH ROW
EXECUTE FUNCTION public.prevent_negative_usage();
