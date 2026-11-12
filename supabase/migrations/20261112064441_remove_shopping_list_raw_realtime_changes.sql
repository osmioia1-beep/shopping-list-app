ALTER PUBLICATION supabase_realtime DROP TABLE public.lists, public.items, public.purchase_history;
REVOKE SELECT ON TABLE public.lists, public.items, public.purchase_history FROM authenticated;
