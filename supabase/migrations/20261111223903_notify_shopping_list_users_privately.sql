CREATE POLICY shopping_list_user_signal_read ON realtime.messages
  FOR SELECT TO authenticated
  USING (extension = 'broadcast' AND realtime.topic() = 'shopping-list:user:' || (SELECT auth.uid())::text);

CREATE POLICY shopping_list_user_signal_scope ON realtime.messages
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    realtime.topic() NOT LIKE 'shopping-list:user:%'
    OR (extension = 'broadcast' AND realtime.topic() = 'shopping-list:user:' || (SELECT auth.uid())::text)
  );

CREATE FUNCTION shopping_list_private.notify_list_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  affected_list integer;
  recipient uuid;
BEGIN
  IF TG_TABLE_NAME = 'lists' THEN
    affected_list := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  ELSE
    affected_list := CASE WHEN TG_OP = 'DELETE' THEN OLD.list_id ELSE NEW.list_id END;
  END IF;

  IF TG_TABLE_NAME = 'list_members' AND TG_OP = 'DELETE' THEN
    -- The former member needs one refresh to clear the revoked list.
    PERFORM realtime.send('{}'::jsonb, 'refresh', 'shopping-list:user:' || OLD.user_id, true);
  END IF;

  FOR recipient IN
    SELECT owner_id FROM public.lists WHERE id = affected_list AND owner_id IS NOT NULL
    UNION
    SELECT user_id FROM public.list_members WHERE list_id = affected_list
  LOOP
    PERFORM realtime.send('{}'::jsonb, 'refresh', 'shopping-list:user:' || recipient, true);
  END LOOP;

  IF TG_TABLE_NAME = 'lists' AND TG_OP = 'DELETE' THEN
    IF OLD.owner_id IS NOT NULL THEN
      PERFORM realtime.send('{}'::jsonb, 'refresh', 'shopping-list:user:' || OLD.owner_id, true);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION shopping_list_private.notify_list_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER shopping_list_notify AFTER INSERT OR UPDATE OR DELETE ON public.lists
  FOR EACH ROW EXECUTE FUNCTION shopping_list_private.notify_list_change();
CREATE TRIGGER shopping_list_notify AFTER INSERT OR UPDATE OR DELETE ON public.items
  FOR EACH ROW EXECUTE FUNCTION shopping_list_private.notify_list_change();
CREATE TRIGGER shopping_list_notify AFTER INSERT OR UPDATE OR DELETE ON public.purchase_history
  FOR EACH ROW EXECUTE FUNCTION shopping_list_private.notify_list_change();
CREATE TRIGGER shopping_list_notify AFTER INSERT OR UPDATE OR DELETE ON public.list_members
  FOR EACH ROW EXECUTE FUNCTION shopping_list_private.notify_list_change();
