begin;

create table public.configuracoes_app (
  id boolean primary key default true check (id),
  comissao_percentual numeric(5,2) not null default 5 check (comissao_percentual between 0 and 100)
);
insert into public.configuracoes_app (id, comissao_percentual) values (true, 5);
alter table public.configuracoes_app enable row level security;
revoke all on public.configuracoes_app from public, anon, authenticated;
grant select on public.configuracoes_app to anon, authenticated;
create policy configuracoes_ler_comissao on public.configuracoes_app for select to anon, authenticated using (true);

do $$
begin
  if exists (
    select 1 from public.anuncios
    where preco is not null and round(preco * 1.05, 2) > 9999999999.99
  ) then
    raise exception 'Há anúncios cujo preço com comissão de 5%% excede o limite suportado. Ajuste esses preços antes de aplicar a migração.'
      using errcode = '22023';
  end if;
end;
$$;

alter table public.anuncios
  add column comissao_percentual numeric(5,2) not null default 5,
  add column preco_final numeric(12,2) generated always as
    (round(preco * (1 + comissao_percentual / 100), 2)) stored,
  add constraint anuncios_comissao_valida check (comissao_percentual between 0 and 100);

create table public.reservas (
  id uuid primary key default gen_random_uuid(),
  anuncio_id uuid not null references public.anuncios(id) on delete cascade,
  comprador_id uuid not null references public.perfis(id),
  vendedor_id uuid not null references public.perfis(id),
  estado text not null default 'ativa' check (estado in ('ativa', 'cancelada')),
  preco_base numeric(12,2),
  preco_final numeric(12,2),
  percentual_comissao numeric(5,2) not null,
  valor_comissao numeric(12,2),
  valor_repasse numeric(12,2),
  cancelada_por uuid references public.perfis(id),
  created_at timestamptz not null default now(),
  cancelada_em timestamptz,
  check (comprador_id <> vendedor_id)
);
create unique index reservas_anuncio_ativa_idx on public.reservas (anuncio_id) where estado = 'ativa';
create index reservas_comprador_idx on public.reservas (comprador_id, created_at desc);
create index reservas_vendedor_idx on public.reservas (vendedor_id, created_at desc);

create table public.mensagens_negociacao (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid not null references public.reservas(id) on delete cascade,
  autor_id uuid not null default auth.uid() references public.perfis(id),
  conteudo text not null check (char_length(btrim(conteudo)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index mensagens_negociacao_reserva_idx on public.mensagens_negociacao (reserva_id, created_at, id);

alter table public.reservas enable row level security;
alter table public.mensagens_negociacao enable row level security;
revoke all on public.reservas, public.mensagens_negociacao from public, anon, authenticated;
grant select on public.reservas, public.mensagens_negociacao to authenticated;
grant insert (reserva_id, conteudo) on public.mensagens_negociacao to authenticated;

create policy reservas_ler_participantes on public.reservas for select to authenticated
  using (privado.usuario_ativo() and auth.uid() in (comprador_id, vendedor_id));
create policy mensagens_ler_participantes on public.mensagens_negociacao for select to authenticated
  using (privado.usuario_ativo() and exists (
    select 1 from public.reservas r
    where r.id = reserva_id and r.estado = 'ativa' and auth.uid() in (r.comprador_id, r.vendedor_id)
  ));
create policy mensagens_enviar_participantes on public.mensagens_negociacao for insert to authenticated
  with check (autor_id = auth.uid() and privado.usuario_ativo() and exists (
    select 1 from public.reservas r
    where r.id = reserva_id and r.estado = 'ativa' and auth.uid() in (r.comprador_id, r.vendedor_id)
  ));

create function privado.definir_comissao_anuncio()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.preco is distinct from old.preco then
    select c.comissao_percentual into new.comissao_percentual from public.configuracoes_app c where c.id;
  end if;
  return new;
end;
$$;
revoke all on function privado.definir_comissao_anuncio() from public, anon, authenticated;
create trigger anuncios_definir_comissao before insert or update on public.anuncios
  for each row execute function privado.definir_comissao_anuncio();

create function privado.proteger_anuncio_reservado()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.reservas r where r.anuncio_id = old.id and r.estado = 'ativa') then
    if tg_op <> 'DELETE' or not privado.eh_admin() then
      raise exception 'Esta sobra está reservada em um carrinho e não pode ser alterada.' using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function privado.proteger_anuncio_reservado() from public, anon, authenticated;
create trigger anuncios_proteger_reserva before update or delete on public.anuncios
  for each row execute function privado.proteger_anuncio_reservado();

create function privado.proteger_fotos_reservadas()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_anuncio uuid;
begin
  if tg_op = 'DELETE' then v_anuncio := old.anuncio_id; else v_anuncio := new.anuncio_id; end if;
  if exists (select 1 from public.reservas r where r.anuncio_id = v_anuncio and r.estado = 'ativa')
     and not (tg_op = 'DELETE' and privado.eh_admin()) then
    raise exception 'As fotos não podem ser alteradas enquanto a sobra estiver reservada.' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function privado.proteger_fotos_reservadas() from public, anon, authenticated;
create trigger fotos_proteger_reserva before insert or update or delete on public.anuncio_fotos
  for each row execute function privado.proteger_fotos_reservadas();

alter policy anuncios_ler_autenticado on public.anuncios
  using (privado.usuario_ativo() and (
    (status = 'Disponível' and privado.marcenaria_ativa(marcenaria_id))
    or marcenaria_id = auth.uid() or privado.eh_admin()
  ));
alter policy fotos_ler_anuncio_visivel on public.anuncio_fotos
  using (exists (select 1 from public.anuncios a where a.id = anuncio_fotos.anuncio_id));

create or replace view public.anuncios_publicos with (security_barrier = true) as
select a.id, a.marcenaria_id, a.material, a.espessura, a.acabamento,
       a.comprimento, a.largura, a.quantidade, a.preco_final as preco, a.observacoes,
       a.cidade, a.bairro, a.status, a.created_at, a.updated_at,
       p.nome as marcenaria_nome
from public.anuncios a join public.perfis p on p.id = a.marcenaria_id
where p.ativo and p.role = 'marcenaria' and a.status = 'Disponível'
  and (auth.role() = 'anon' or (auth.role() = 'authenticated' and privado.usuario_ativo()));

create function public.adicionar_ao_carrinho(p_anuncio_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_anuncio public.anuncios%rowtype;
  v_vendedor_id uuid;
  v_id uuid;
  v_comissao numeric(12,2);
begin
  if not privado.eh_marcenaria_ativa() then
    raise exception 'Entre com uma conta ativa para reservar esta sobra.' using errcode = '42501';
  end if;
  select a.marcenaria_id into v_vendedor_id from public.anuncios a where a.id = p_anuncio_id;
  if not found then
    raise exception 'Esta sobra não está mais disponível.' using errcode = 'P0001';
  end if;
  perform 1 from public.perfis p
    where p.id in (auth.uid(), v_vendedor_id)
    order by p.id for update;
  if not privado.eh_marcenaria_ativa() then
    raise exception 'Entre com uma conta ativa para reservar esta sobra.' using errcode = '42501';
  end if;
  select * into v_anuncio from public.anuncios where id = p_anuncio_id for update;
  if not found or v_anuncio.status <> 'Disponível' or not privado.marcenaria_ativa(v_anuncio.marcenaria_id) then
    raise exception 'Esta sobra não está mais disponível.' using errcode = 'P0001';
  end if;
  if v_anuncio.marcenaria_id = auth.uid() then
    raise exception 'Você não pode reservar sua própria sobra.' using errcode = 'P0001';
  end if;
  v_comissao := round(v_anuncio.preco_final * v_anuncio.comissao_percentual / 100, 2);
  update public.anuncios set status = 'Reservada' where id = v_anuncio.id;
  insert into public.reservas (anuncio_id, comprador_id, vendedor_id, preco_base, preco_final,
    percentual_comissao, valor_comissao, valor_repasse)
  values (v_anuncio.id, auth.uid(), v_anuncio.marcenaria_id, v_anuncio.preco, v_anuncio.preco_final,
    v_anuncio.comissao_percentual, v_comissao, v_anuncio.preco_final - v_comissao)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.adicionar_ao_carrinho(uuid) from public, anon, authenticated;
grant execute on function public.adicionar_ao_carrinho(uuid) to authenticated;

create function public.remover_do_carrinho(p_reserva_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_anuncio_id uuid;
begin
  if not privado.eh_marcenaria_ativa() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  select r.anuncio_id into v_anuncio_id from public.reservas r
    where r.id = p_reserva_id and r.comprador_id = auth.uid();
  if not found then raise exception 'Reserva não encontrada.' using errcode = 'P0001'; end if;
  perform 1 from public.anuncios where id = v_anuncio_id for update;
  if not found then return; end if;
  perform 1 from public.reservas r
    where r.id = p_reserva_id and r.comprador_id = auth.uid() for update;
  if not found then raise exception 'Reserva não encontrada.' using errcode = 'P0001'; end if;
  update public.reservas set estado = 'cancelada', cancelada_em = now(), cancelada_por = auth.uid()
    where id = p_reserva_id and comprador_id = auth.uid() and estado = 'ativa';
  if found then
    update public.anuncios set status = 'Disponível' where id = v_anuncio_id and status = 'Reservada';
  end if;
end;
$$;
revoke all on function public.remover_do_carrinho(uuid) from public, anon, authenticated;
grant execute on function public.remover_do_carrinho(uuid) to authenticated;

create function public.cancelar_reserva_admin(p_reserva_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_anuncio_id uuid;
begin
  if not privado.eh_admin() then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  perform 1 from public.anuncios a where exists (
    select 1 from public.reservas r where r.id = p_reserva_id and r.anuncio_id = a.id
  ) for update of a;
  select r.anuncio_id into v_anuncio_id from public.reservas r where r.id = p_reserva_id for update;
  if not found then raise exception 'Reserva não encontrada.' using errcode = 'P0001'; end if;
  update public.reservas set estado = 'cancelada', cancelada_em = now(), cancelada_por = auth.uid()
    where id = p_reserva_id and estado = 'ativa';
  if found then
    update public.anuncios set status = 'Disponível' where id = v_anuncio_id and status = 'Reservada';
  end if;
end;
$$;
revoke all on function public.cancelar_reserva_admin(uuid) from public, anon, authenticated;
grant execute on function public.cancelar_reserva_admin(uuid) to authenticated;

create function privado.cancelar_reservas_perfil_desativado()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_reserva record;
  v_anuncio_id uuid;
begin
  if new.ativo or not old.ativo then return new; end if;
  for v_reserva in
    select r.id, r.anuncio_id from public.reservas r
    where r.estado = 'ativa' and old.id in (r.comprador_id, r.vendedor_id)
    order by r.id
  loop
    perform 1 from public.anuncios where id = v_reserva.anuncio_id for update;
    if not found then continue; end if;
    perform 1 from public.reservas r
      where r.id = v_reserva.id and r.estado = 'ativa' for update;
    if not found then continue; end if;
    update public.reservas set estado = 'cancelada', cancelada_em = now(), cancelada_por = old.id
      where id = v_reserva.id and estado = 'ativa';
    update public.anuncios set status = 'Disponível' where id = v_reserva.anuncio_id and status = 'Reservada';
  end loop;
  return new;
end;
$$;
revoke all on function privado.cancelar_reservas_perfil_desativado() from public, anon, authenticated;
create trigger perfis_cancelar_reservas_desativado after update of ativo on public.perfis
  for each row execute function privado.cancelar_reservas_perfil_desativado();

create function public.definir_preco_reserva(p_reserva_id uuid, p_preco numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_reserva public.reservas%rowtype;
  v_final numeric(12,2);
  v_comissao numeric(12,2);
begin
  if not privado.eh_marcenaria_ativa() then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  select * into v_reserva from public.reservas r
    where r.id = p_reserva_id and r.vendedor_id = auth.uid() and r.estado = 'ativa' for update;
  if not found then raise exception 'Reserva não encontrada.' using errcode = 'P0001'; end if;
  if v_reserva.preco_base is not null then raise exception 'O preço desta reserva já foi definido.' using errcode = 'P0001'; end if;
  if p_preco is null or p_preco < 0 or p_preco = 'NaN'::numeric
     or p_preco <> round(p_preco, 2) or p_preco * (1 + v_reserva.percentual_comissao / 100) > 9999999999.99 then
    raise exception 'Informe um preço válido.' using errcode = '22023';
  end if;
  v_final := round(p_preco * (1 + v_reserva.percentual_comissao / 100), 2);
  v_comissao := round(v_final * v_reserva.percentual_comissao / 100, 2);
  update public.reservas set preco_base = p_preco, preco_final = v_final,
    valor_comissao = v_comissao, valor_repasse = v_final - v_comissao where id = p_reserva_id;
end;
$$;
revoke all on function public.definir_preco_reserva(uuid, numeric) from public, anon, authenticated;
grant execute on function public.definir_preco_reserva(uuid, numeric) to authenticated;

create function public.minhas_reservas()
returns table (
  id uuid, anuncio_id uuid, comprador_id uuid, vendedor_id uuid, estado text,
  material text, acabamento text, espessura numeric, comprimento numeric, largura numeric,
  quantidade integer, vendedor_nome text, comprador_nome text, preco_base numeric,
  preco_final numeric, percentual_comissao numeric, valor_comissao numeric,
  valor_repasse numeric, cancelada_por uuid, created_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not privado.eh_marcenaria_ativa() then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  return query
    select r.id, r.anuncio_id, r.comprador_id, r.vendedor_id, r.estado,
      a.material, a.acabamento, a.espessura, a.comprimento, a.largura,
      a.quantidade, vendedor.nome, comprador.nome, r.preco_base, r.preco_final,
      r.percentual_comissao, r.valor_comissao, r.valor_repasse, r.cancelada_por, r.created_at
    from public.reservas r
    join public.anuncios a on a.id = r.anuncio_id
    join public.perfis vendedor on vendedor.id = r.vendedor_id
    join public.perfis comprador on comprador.id = r.comprador_id
    where r.estado = 'ativa' and auth.uid() in (r.comprador_id, r.vendedor_id)
    order by r.created_at desc, r.id desc;
end;
$$;
revoke all on function public.minhas_reservas() from public, anon, authenticated;
grant execute on function public.minhas_reservas() to authenticated;

commit;
