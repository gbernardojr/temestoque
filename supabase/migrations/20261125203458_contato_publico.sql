-- Permite que visitantes obtenham o contato de anúncios disponíveis de
-- marcenarias ativas. O número continua fora das views públicas e só é
-- entregue sob demanda para o anúncio consultado.

begin;

create or replace function public.contato_whatsapp(p_anuncio_id uuid)
returns table (nome text, whatsapp text, url_whatsapp text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_autenticado boolean := auth.uid() is not null;
begin
  if v_autenticado and not privado.usuario_ativo() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if v_autenticado then
    return query
      select p.nome, p.whatsapp,
             'https://wa.me/' || substr(p.whatsapp, 2)
      from public.anuncios a join public.perfis p on p.id = a.marcenaria_id
      where a.id = p_anuncio_id
        and (
          privado.eh_admin() or a.marcenaria_id = auth.uid()
          or (a.status = 'Disponível' and p.ativo and p.role = 'marcenaria')
        );
  else
    return query
      select p.nome, p.whatsapp,
             'https://wa.me/' || substr(p.whatsapp, 2)
      from public.anuncios a join public.perfis p on p.id = a.marcenaria_id
      where a.id = p_anuncio_id
        and a.status = 'Disponível' and p.ativo and p.role = 'marcenaria';
  end if;
end;
$$;
grant execute on function public.contato_whatsapp(uuid) to anon, authenticated;

commit;
