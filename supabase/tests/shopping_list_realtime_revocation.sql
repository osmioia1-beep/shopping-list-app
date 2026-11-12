BEGIN;

DO $$
DECLARE
  owner_id uuid := gen_random_uuid();
  guest_id uuid := gen_random_uuid();
  test_list integer;
  test_item integer;
  owner_topic text := 'shopping-list:user:' || owner_id;
  guest_topic text := 'shopping-list:user:' || guest_id;
  owner_messages bigint;
  guest_messages bigint;
BEGIN
  INSERT INTO public.users (id, email) VALUES
    (owner_id, owner_id || '@example.com'), (guest_id, guest_id || '@example.com');
  INSERT INTO public.lists (name, owner_id) VALUES ('Realtime regression test', owner_id)
    RETURNING id INTO test_list;
  INSERT INTO public.list_members (list_id, user_id, role) VALUES (test_list, guest_id, 'viewer');
  INSERT INTO public.items (list_id, name, quantity) VALUES (test_list, 'Test article', 1)
    RETURNING id INTO test_item;

  SELECT count(*) INTO guest_messages FROM realtime.messages WHERE topic = guest_topic;
  IF guest_messages = 0 THEN RAISE EXCEPTION 'Viewer never received a refresh'; END IF;

  DELETE FROM public.list_members WHERE list_id = test_list AND user_id = guest_id;
  IF (SELECT count(*) FROM realtime.messages WHERE topic = guest_topic) <> guest_messages + 1 THEN
    RAISE EXCEPTION 'Viewer did not receive one final refresh at revocation';
  END IF;

  SELECT count(*) INTO owner_messages FROM realtime.messages WHERE topic = owner_topic;
  UPDATE public.items SET quantity = 2 WHERE id = test_item;
  DELETE FROM public.items WHERE id = test_item;

  IF (SELECT count(*) FROM realtime.messages WHERE topic = guest_topic) <> guest_messages + 1 THEN
    RAISE EXCEPTION 'Revoked viewer received a later item change';
  END IF;
  IF (SELECT count(*) FROM realtime.messages WHERE topic = owner_topic) <> owner_messages + 2 THEN
    RAISE EXCEPTION 'Owner did not receive both later item changes';
  END IF;
  IF EXISTS (
    SELECT 1 FROM realtime.messages WHERE topic IN (owner_topic, guest_topic)
      AND ((payload - 'id') IS DISTINCT FROM '{}'::jsonb OR private IS DISTINCT FROM true)
  ) THEN RAISE EXCEPTION 'A refresh carried data or was public'; END IF;
END;
$$;

ROLLBACK;
