CREATE SCHEMA IF NOT EXISTS shopping_list_private;
REVOKE ALL ON SCHEMA shopping_list_private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION shopping_list_private.can_read_list(target_list_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lists
    WHERE id = target_list_id AND owner_id = (SELECT auth.uid())
  ) OR EXISTS (
    SELECT 1 FROM public.list_members
    WHERE list_id = target_list_id AND user_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION shopping_list_private.can_read_list(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION shopping_list_private.can_read_list(integer) TO authenticated;

DO $$
DECLARE existing_policy record;
BEGIN
  FOR existing_policy IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('lists', 'items', 'purchase_history', 'list_members', 'list_invites', 'users')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', existing_policy.policyname, existing_policy.tablename);
  END LOOP;
END;
$$;

CREATE POLICY shopping_list_read ON public.lists
  FOR SELECT TO authenticated USING (shopping_list_private.can_read_list(id));
CREATE POLICY shopping_list_items_read ON public.items
  FOR SELECT TO authenticated USING (shopping_list_private.can_read_list(list_id));
CREATE POLICY shopping_list_history_read ON public.purchase_history
  FOR SELECT TO authenticated USING (shopping_list_private.can_read_list(list_id));

ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.list_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.list_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
