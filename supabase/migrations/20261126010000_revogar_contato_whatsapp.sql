begin;

revoke execute on function public.contato_whatsapp(uuid) from public, anon, authenticated;

commit;
