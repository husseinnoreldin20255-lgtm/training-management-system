import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const allowedRoles = new Set([
  'super_admin',
  'training_manager',
  'training_officer',
  'supervisor',
  'trainer',
  'report_viewer'
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'غير مصرح' }, 401);

    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anonKey || !serviceKey) return json({ error: 'إعدادات Supabase غير مكتملة على الخادم' }, 500);

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const admin = createClient(url, serviceKey);

    const { data: authData, error: authError } = await userClient.auth.getUser();
    const user = authData?.user;
    if (authError || !user) return json({ error: 'جلسة الدخول غير صالحة' }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    // تهيئة أول مدير: إذا لم يوجد أي super_admin بعد، يصبح أول حساب Auth موثوق هو مدير النظام.
    if (action === 'bootstrap') {
      const { count, error: countError } = await admin
        .from('user_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'super_admin');
      if (countError) throw countError;

      const { data: existing } = await admin
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (existing) {
        if (!existing.active) return json({ error: 'الحساب غير نشط' }, 403);
        return json({ profile: existing });
      }

      if ((count ?? 0) > 0) return json({ error: 'الحساب غير مرتبط بملف مستخدم' }, 403);

      const fullName = String(user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'مدير النظام').trim();
      const { data: profile, error: insertError } = await admin
        .from('user_profiles')
        .insert({ id: user.id, full_name: fullName, role: 'super_admin', organization_id: null, active: true })
        .select('*')
        .single();
      if (insertError) throw insertError;
      return json({ profile });
    }

    const { data: caller, error: callerError } = await admin
      .from('user_profiles')
      .select('id, role, active')
      .eq('id', user.id)
      .maybeSingle();
    if (callerError) throw callerError;
    if (!caller || caller.role !== 'super_admin' || !caller.active) return json({ error: 'هذه العملية متاحة لمدير النظام فقط' }, 403);

    if (action === 'list') {
      const { data: profiles, error: profileError } = await admin
        .from('user_profiles')
        .select('id, full_name, role, organization_id, active, created_at, updated_at')
        .order('created_at', { ascending: false });
      if (profileError) throw profileError;

      const { data: authUsers, error: authListError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (authListError) throw authListError;
      const emailById = new Map((authUsers.users || []).map(u => [u.id, u.email || '']));
      const users = (profiles || []).map(p => ({ ...p, email: emailById.get(p.id) || '' }));
      return json({ users });
    }

    if (action === 'create') {
      const full_name = String(body.full_name || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const role = String(body.role || '');
      const organization_id = body.organization_id || null;

      if (!full_name) return json({ error: 'الاسم مطلوب' }, 400);
      if (!email) return json({ error: 'البريد الإلكتروني مطلوب' }, 400);
      if (password.length < 8) return json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' }, 400);
      if (!allowedRoles.has(role)) return json({ error: 'الدور غير موجود' }, 400);
      if (role === 'supervisor' && !organization_id) return json({ error: 'يجب اختيار الجهة للمشرف / مسؤول الجهة' }, 400);
      if (role !== 'supervisor') {
        // لا نربط الأدوار الأخرى بجهة إلا إذا احتاجها التصميم لاحقًا.
        // لا نرفض قيمة null.
      }

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name }
      });
      if (createError) throw createError;

      const { data: profile, error: profileError } = await admin
        .from('user_profiles')
        .insert({ id: created.user.id, full_name, role, organization_id: role === 'supervisor' ? organization_id : null, active: true })
        .select('*')
        .single();
      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id);
        throw profileError;
      }
      return json({ ok: true, profile });
    }

    return json({ error: 'العملية غير مدعومة' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, 400);
  }
});
