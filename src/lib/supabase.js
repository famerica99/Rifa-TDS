

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://qejoudfuqzhwqebmtdaq.supabase.co'
const supabaseKey = 'sb_publishable_d3z39rItKmkGFtCqeZQrOQ_DC6rriDl'

export const supabase = createClient(supabaseUrl, supabaseKey)