import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://lfatskduuzwdqoomtphh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_glIqqTFNY8hDXl_3qaEOFQ_BWX8QU8T";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
