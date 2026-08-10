النسخة النهائية لنظام إدارة التدريب

1) Supabase > Edge Functions > admin-users
   استبدل الكود الحالي بالكامل بمحتوى admin-users/index.ts ثم Deploy.

2) استبدل index.html الحالي بهذا الملف.

3) افتح البرنامج وسجّل الدخول بنفس حساب المدير الموجود في Supabase.

لا تشغّل SQL جديدًا.
لا تنشئ حسابًا جديدًا.
الـ Edge Function تهيئ أول super_admin تلقائيًا إذا لم يوجد profile له.
