REVOKE ALL PRIVILEGES ON TABLE public.users, public.lists, public.items, public.list_members, public.list_invites, public.purchase_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.lists, public.items, public.purchase_history TO authenticated;
